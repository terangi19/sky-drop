import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "app/components/SkyAiChatPanel.tsx");

describe("Client / server OpenAI boundary", () => {
  it("SkyAiChatPanel does not import spend-guard, spending, health, or firebase-admin", () => {
    const src = fs.readFileSync(PANEL, "utf8");
    expect(src).toMatch(/["']use client["']/);
    expect(src).toMatch(/from ["']\.\.\/lib\/sky-ai-rule-fallback["']/);
    expect(src).not.toMatch(/openai-health/);
    expect(src).not.toMatch(/openai-spend-guard/);
    expect(src).not.toMatch(/openai-spending/);
    expect(src).not.toMatch(/firebase-admin/);
    expect(src).toMatch(/fetch\(["']\/api\/sky-ai\/status["']/);
  });

  it("check-drift fails closed on client imports of server-only OpenAI/Admin modules", () => {
    const out = execFileSync("node", ["scripts/check-drift.cjs"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out).toContain(
      "OK: Client bundle does not import spend-guard, openai-spending, openai-health, or firebase-admin."
    );
  });
});
