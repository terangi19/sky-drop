/**
 * Live OpenAI eval — local prompts (preferred) + optional production comparison.
 *
 * Local (tests uncommitted prompt changes):
 *   Add OPENAI_API_KEY to .env.local, then: npm run test:awhina:live
 *
 * Route stack (vercel dev + task-reply layer, no key needed for find/troubleshoot):
 *   SKY_AI_LIVE_URL=http://localhost:3001/api/sky-ai npm run test:awhina:live
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { buildSkyAiSystemPrompt } from "./sky-ai-prompt";
import { extractSkyAiReply } from "./sky-ai-listing-fill";
import { getSkyAiIntentHint } from "./sky-ai-intent";
import { trySkyAiTaskReply } from "./sky-ai-task-replies";
import { scoreConversationReply } from "./sky-ai-reply-quality";
import { LIVE_EVAL_SCENARIOS, type LiveEvalScenario } from "./sky-ai-live-scenarios";

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile(join(process.cwd(), ".env.local"));

const LOCAL_KEY = process.env.OPENAI_API_KEY?.trim() || "";
const ROUTE_URL = process.env.SKY_AI_LIVE_URL?.trim() || "";
const PRODUCTION_URL =
  process.env.SKY_AI_COMPARE_URL?.trim() || "https://skydrop.co.nz/api/sky-ai";
const COMPARE_PRODUCTION = process.env.SKY_AI_COMPARE_PRODUCTION === "1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type AwhinaLiveResponse = {
  reply: string;
  listingFill?: unknown;
  source?: string;
  code?: string;
  raw?: string;
};

function scoreScenario(
  scenario: LiveEvalScenario,
  reply: string,
  listingFill?: unknown
): string[] {
  const failures: string[] = [];
  const quality = scoreConversationReply(reply, {
    requireNextStep: true,
    requirePricing: scenario.requirePricing,
    requireNavigate: scenario.requireNavigate,
    maxQuestions: scenario.maxQuestions ?? 1,
    listingFill,
  });
  failures.push(...quality.failures);

  const hasFill = Boolean(listingFill) || /\[\[listing_fill\]\]/i.test(reply);
  if (scenario.expectListingFill && !hasFill) failures.push("missing_listing_fill");
  if (scenario.expectNoListingFill && hasFill) failures.push("unexpected_listing_fill");

  return failures;
}

async function askAwhinaLocal(
  userMessage: string,
  pathname: string
): Promise<AwhinaLiveResponse> {
  const task = trySkyAiTaskReply(userMessage, pathname);
  if (task) {
    return { reply: task.text, source: task.source, raw: task.text };
  }

  const client = new OpenAI({ apiKey: LOCAL_KEY });
  const system =
    buildSkyAiSystemPrompt(pathname) + `\n\n${getSkyAiIntentHint(userMessage, pathname)}`;
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.35,
    max_tokens: 1200,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  const parsed = extractSkyAiReply(raw);
  return {
    reply: parsed.text || raw,
    listingFill: parsed.listingFill,
    source: "ai",
    raw,
  };
}

async function askAwhinaProduction(
  userMessage: string,
  pathname: string
): Promise<AwhinaLiveResponse> {
  return askAwhinaRoute(userMessage, pathname, PRODUCTION_URL);
}

describe("live eval configuration", () => {
  it("documents eval mode", () => {
    if (LOCAL_KEY) {
      expect(LOCAL_KEY.length).toBeGreaterThan(10);
    }
    expect(LIVE_EVAL_SCENARIOS.length).toBe(12);
  });
});

describe.skipIf(!LOCAL_KEY)("live Āwhina — local prompts (OPENAI_API_KEY)", () => {
  for (const scenario of LIVE_EVAL_SCENARIOS) {
    it(`${scenario.id}: ${scenario.title}`, async () => {
      const { reply, listingFill, source, raw } = await askAwhinaLocal(
        scenario.userMessage,
        scenario.pathname
      );
      expect(source === "ai" || source === "rules").toBe(true);
      expect(reply.length).toBeGreaterThan(15);

      const failures = scoreScenario(scenario, raw || reply, listingFill);
      expect(failures, `[local] ${scenario.id}\n${reply}`).toEqual([]);
    }, 120_000);
  }
});

async function askAwhinaRoute(
  userMessage: string,
  pathname: string,
  baseUrl: string
): Promise<AwhinaLiveResponse> {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage, pathname, history: [], stream: false }),
  });
  const data = (await res.json()) as AwhinaLiveResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || data.code || `HTTP ${res.status}`);
  }
  return { ...data, source: data.source || (res.ok ? "ai" : "error") };
}

describe.skipIf(!ROUTE_URL)("live Āwhina — route stack (SKY_AI_LIVE_URL)", () => {
  for (const scenario of LIVE_EVAL_SCENARIOS) {
    it(`${scenario.id}: via route`, async () => {
      let response: AwhinaLiveResponse;
      try {
        response = await askAwhinaRoute(scenario.userMessage, scenario.pathname, ROUTE_URL);
      } catch (e) {
        if (scenario.expectListingFill) {
          expect.fail(
            `Sell scenario "${scenario.id}" needs OPENAI_API_KEY in .env.local (restart vercel dev). ${e}`
          );
        }
        throw e;
      }

      if (response.code === "missing_openai_key" && scenario.expectListingFill) {
        expect.fail(
          `Sell scenario "${scenario.id}" needs OPENAI_API_KEY in .env.local — server returned missing_openai_key`
        );
      }

      const failures = scoreScenario(scenario, response.reply, response.listingFill);
      expect(failures, `[route] ${scenario.id}\n${response.reply}`).toEqual([]);
    }, 120_000);
  }
});
describe.skipIf(!COMPARE_PRODUCTION)(
  "live Āwhina — production comparison (optional)",
  () => {
    for (const scenario of LIVE_EVAL_SCENARIOS) {
      it(`${scenario.id}: production baseline`, async () => {
        const { reply, listingFill, source } = await askAwhinaRoute(
          scenario.userMessage,
          scenario.pathname,
          PRODUCTION_URL
        );
        expect(source).toBeTruthy();
        const failures = scoreScenario(scenario, reply, listingFill);
        if (failures.length) {
          console.warn(`[production] ${scenario.id} failures:`, failures.join(", "));
        }
        expect(failures.length).toBeGreaterThanOrEqual(0);
      }, 120_000);
    }
  }
);
