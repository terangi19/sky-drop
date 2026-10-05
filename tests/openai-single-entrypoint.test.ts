/**
 * Static guard: the ONLY place that may construct an OpenAI client or talk to
 * api.openai.com is app/lib/openai-spend-guard.ts (createGatedOpenAI), so every
 * billed model call passes the spend gate. Also blocks any other LLM SDK/endpoint.
 *
 * If this fails you added a model call that bypasses the spend guard. Route it
 * through createGatedOpenAI / gateOpenAiCall instead of extending the allow-list.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const ALLOWED = new Set(["app/lib/openai-spend-guard.ts"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "coverage",
  "playwright-report",
  "test-results",
  "out",
  "dist",
]);
// functions/lib is tsc output of functions/src
const SKIP_REL_DIRS = new Set(["functions/lib"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Other LLM SDK package names (exact module specifier, or a subpath of it).
const OTHER_LLM_PACKAGES = [
  "@anthropic-ai/sdk",
  "@anthropic-ai/bedrock-sdk",
  "@anthropic-ai/vertex-sdk",
  "anthropic",
  "@google/generative-ai",
  "@google/genai",
  "@google-cloud/vertexai",
  "@google-cloud/aiplatform",
  "groq-sdk",
  "@mistralai/mistralai",
  "mistralai",
  "replicate",
  "cohere-ai",
  "@aws-sdk/client-bedrock-runtime",
  "together-ai",
  "@huggingface/inference",
  "openai-edge",
  "ollama",
  "langchain",
  "@langchain/core",
  "@langchain/openai",
  "@langchain/anthropic",
  "@langchain/google-genai",
  "@xai-org/xai-sdk",
  "ai",
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/xai",
  "@openrouter/ai-sdk-provider",
];

const LLM_ENDPOINT_HOSTS = [
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "aiplatform.googleapis.com",
  "api.x.ai",
  "api.groq.com",
  "api.mistral.ai",
  "api.replicate.com",
  "api.cohere.ai",
  "api.cohere.com",
  "api.together.xyz",
  "api-inference.huggingface.co",
  "openrouter.ai",
  "api.deepseek.com",
  "api.perplexity.ai",
];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/@-]/g, "\\$&");
}

type Violation = { rule: string; line: number; text: string };

/** Scan one source string. Pure, so it is unit-tested below. */
export function scanSource(src: string): Violation[] {
  const out: Violation[] = [];
  const lines = src.split(/\r?\n/);
  const pkgAlt = OTHER_LLM_PACKAGES.map(esc).join("|");
  // module specifier: "pkg" or "pkg/sub" in import/from/require/import()
  const otherSdk = new RegExp(
    `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)["'](?:${pkgAlt})(?:/[^"']*)?["']`
  );
  const hosts = new RegExp(LLM_ENDPOINT_HOSTS.map(esc).join("|"), "i");
  lines.forEach((text, i) => {
    const line = i + 1;
    const add = (rule: string) => out.push({ rule, line, text: text.trim().slice(0, 160) });
    if (/\bnew\s+(?:Azure)?OpenAI\s*\(/.test(text)) add("new OpenAI(");
    if (/\bapi\.openai\.com\b/i.test(text) || /\.openai\.azure\.com\b/i.test(text)) {
      add("api.openai.com / azure openai endpoint");
    }
    // Value import/require of the SDK. `import type ... from "openai"` is allowed.
    const importsOpenAi =
      /\bfrom\s*["']openai(?:\/[^"']*)?["']/.test(text) ||
      /\brequire\s*\(\s*["']openai(?:\/[^"']*)?["']\s*\)/.test(text) ||
      /\bimport\s*\(\s*["']openai(?:\/[^"']*)?["']\s*\)/.test(text) ||
      /^\s*import\s*["']openai(?:\/[^"']*)?["']/.test(text);
    if (importsOpenAi && !/^\s*(?:import|export)\s+type\b/.test(text)) {
      add('value import of "openai"');
    }
    if (otherSdk.test(text)) add("other LLM SDK import");
    if (hosts.test(text)) add("other LLM endpoint");
  });
  return out;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_REL_DIRS.has(rel)) continue;
      walk(abs, files);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      files.push(rel);
    }
  }
  return files;
}

describe("OpenAI single entry point (static)", () => {
  const files = walk(ROOT);

  it("scans the real source tree (sanity)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("app/lib/openai-spend-guard.ts");
    expect(files.some((f) => f.startsWith("app/api/"))).toBe(true);
    expect(files.some((f) => f.startsWith("functions/src/"))).toBe(true);
    expect(files.some((f) => f.startsWith("scripts/"))).toBe(true);
    expect(files.every((f) => !f.includes("node_modules/"))).toBe(true);
  });

  it("the allow-listed guard file still constructs the only client", () => {
    for (const rel of ALLOWED) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
    const guard = fs.readFileSync(path.join(ROOT, "app/lib/openai-spend-guard.ts"), "utf8");
    expect(scanSource(guard).some((v) => v.rule === "new OpenAI(")).toBe(true);
  });

  it("no non-test source outside openai-spend-guard.ts constructs OpenAI, imports the SDK as a value, or calls api.openai.com / another LLM", () => {
    const found: string[] = [];
    for (const rel of files) {
      if (ALLOWED.has(rel)) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const v of scanSource(src)) found.push(`${rel}:${v.line} [${v.rule}] ${v.text}`);
    }
    expect(found, `Unguarded model call paths:\n${found.join("\n")}`).toEqual([]);
  });

  it("package.json files declare no other LLM SDK and only the root declares openai", () => {
    const banned = new Set(OTHER_LLM_PACKAGES);
    for (const rel of ["package.json", "functions/package.json"]) {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) as Record<
        string,
        Record<string, string> | undefined
      >;
      const deps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.optionalDependencies,
        ...pkg.peerDependencies,
      });
      expect(
        deps.filter((d) => banned.has(d) || d.startsWith("@ai-sdk/") || d.startsWith("@langchain/")),
        `${rel} declares an LLM SDK`
      ).toEqual([]);
      if (rel !== "package.json") expect(deps).not.toContain("openai");
    }
  });

  describe("scanner self-test (would catch a new unguarded call)", () => {
    it("flags direct client construction and endpoints", () => {
      expect(scanSource('const c = new OpenAI({ apiKey });').map((v) => v.rule)).toContain("new OpenAI(");
      expect(scanSource('const c = new  AzureOpenAI ({});').length).toBeGreaterThan(0);
      expect(scanSource('await fetch("https://api.openai.com/v1/chat/completions")').length).toBe(1);
      expect(scanSource('import OpenAI from "openai";').length).toBe(1);
      expect(scanSource('import { OpenAI } from "openai/index";').length).toBe(1);
      expect(scanSource('const O = require("openai");').length).toBe(1);
      expect(scanSource('const O = await import("openai");').length).toBe(1);
      expect(scanSource('import "openai/shims/node";').length).toBe(1);
    });

    it("flags other LLM SDKs and endpoints", () => {
      for (const line of [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { GoogleGenerativeAI } from "@google/generative-ai";',
        'import Groq from "groq-sdk";',
        'const r = require("replicate");',
        'import { generateText } from "ai";',
        'import { openai } from "@ai-sdk/openai";',
        'fetch("https://api.anthropic.com/v1/messages")',
        'fetch("https://generativelanguage.googleapis.com/v1/models")',
        'fetch("https://api.x.ai/v1/chat/completions")',
      ]) {
        expect(scanSource(line).length, line).toBeGreaterThan(0);
      }
    });

    it("allows type-only imports and unrelated text", () => {
      expect(scanSource('import type OpenAI from "openai";')).toEqual([]);
      expect(scanSource('import type { ChatCompletion } from "openai/resources";')).toEqual([]);
      expect(scanSource("const openaiReady = true; // OpenAI health")).toEqual([]);
      expect(scanSource('import { aiThing } from "./ai";')).toEqual([]);
      expect(scanSource('import x from "airbnb";')).toEqual([]);
    });
  });
});
