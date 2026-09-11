/**
 * Server-only OpenAI health. Client Components must fetch `/api/sky-ai/status`
 * and import `skyAiRuleFallbackText` from `sky-ai-rule-fallback.ts` instead.
 */
import "server-only";

import { isOpenAiEnabled } from "./openai-spend-guard";
import { checkGlobalBudgetCaps } from "./openai-spending";

export { skyAiRuleFallbackText } from "./sky-ai-rule-fallback";

export type OpenAiHealthIssue =
  | "not_configured"
  | "auth_failed"
  | "quota_exceeded"
  | "rate_limit"
  | "budget_exceeded"
  | "disabled"
  | "error";

export type OpenAiHealth = {
  configured: boolean;
  ready: boolean;
  issue?: OpenAiHealthIssue;
  model: string;
};

let successCache: { at: number; result: OpenAiHealth } | null = null;
let failureCache: { at: number; result: OpenAiHealth } | null = null;
/** Aligned with the client status TTL. Spend is re-checked; billed calls still gate live. */
const SUCCESS_CACHE_MS = 30_000;
const FAILURE_CACHE_MS = 20_000;

export function isCriticalOpenAiIssue(issue: OpenAiHealthIssue | undefined): boolean {
  return (
    issue === "not_configured" ||
    issue === "auth_failed" ||
    issue === "quota_exceeded"
  );
}

export function __resetOpenAiHealthCacheForTests(): void {
  successCache = null;
  failureCache = null;
}

export async function checkOpenAiHealth(): Promise<OpenAiHealth> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { configured: false, ready: false, issue: "not_configured", model };
  }

  if (!isOpenAiEnabled()) {
    return { configured: true, ready: false, issue: "disabled", model };
  }

  const now = Date.now();
  if (successCache && now - successCache.at < SUCCESS_CACHE_MS) {
    return successCache.result;
  }
  if (failureCache && now - failureCache.at < FAILURE_CACHE_MS) {
    return failureCache.result;
  }

  // Global USD caps only — per-user/IP caps still apply on billed calls.
  // Status must not wait on extra Firestore identity reads or an OpenAI ping.
  try {
    const gate = await checkGlobalBudgetCaps();
    if (!gate.allowed) {
      const result: OpenAiHealth = {
        configured: true,
        ready: false,
        issue: "budget_exceeded",
        model,
      };
      failureCache = { at: now, result };
      successCache = null;
      return result;
    }
  } catch (err) {
    // Fail closed: tracker/admin errors must not report openaiReady.
    console.warn("[openai-health] budget check failed; treating as not ready", err);
    const result: OpenAiHealth = {
      configured: true,
      ready: false,
      issue: "budget_exceeded",
      model,
    };
    failureCache = { at: now, result };
    successCache = null;
    return result;
  }

  // Non-billing health check: key present + spend allowed. Chat surfaces auth/quota errors.
  const result: OpenAiHealth = { configured: true, ready: true, model };
  successCache = { at: now, result };
  failureCache = null;
  return result;
}

export function openAiIssueHint(issue: OpenAiHealthIssue | undefined): string {
  switch (issue) {
    case "not_configured":
      return "Add `OPENAI_API_KEY` to `.env.local`, then restart `npm run dev`.";
    case "auth_failed":
      return "OpenAI rejected the API key — create a new key at platform.openai.com/api-keys.";
    case "quota_exceeded":
      return "Sky AI needs OpenAI billing — add payment at platform.openai.com/account/billing.";
    case "budget_exceeded":
      return "Āwhina AI is in limited mode because the OpenAI budget has been reached.";
    case "disabled":
      return "Āwhina AI is temporarily paused.";
    case "rate_limit":
      return "OpenAI rate limit — wait a minute and try again.";
    default:
      return "OpenAI is unreachable right now.";
  }
}
