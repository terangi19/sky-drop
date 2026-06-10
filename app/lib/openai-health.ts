import OpenAI from "openai";
import { openaiErrorResponse } from "./openai-errors";
import { SKY_AI_GENERIC_FALLBACK, getGuideReply } from "./guide-assistant";
import {
  isSkyAiGeneralQuestion,
  skyAiCapabilitiesReply,
} from "./sky-ai-prompts";

export type OpenAiHealthIssue =
  | "not_configured"
  | "auth_failed"
  | "quota_exceeded"
  | "rate_limit"
  | "error";

export type OpenAiHealth = {
  configured: boolean;
  ready: boolean;
  issue?: OpenAiHealthIssue;
  model: string;
};

let successCache: { at: number; result: OpenAiHealth } | null = null;
let failureCache: { at: number; result: OpenAiHealth } | null = null;
const SUCCESS_CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 20_000;
const OPENAI_PING_TIMEOUT_MS = 12_000;

export function isCriticalOpenAiIssue(issue: OpenAiHealthIssue | undefined): boolean {
  return (
    issue === "not_configured" ||
    issue === "auth_failed" ||
    issue === "quota_exceeded"
  );
}

/** Rule-based reply when OpenAI is unavailable — avoid useless generic one-liner. */
export function skyAiRuleFallbackText(
  message: string,
  pathname: string
): { text: string; navigateTo?: string } {
  if (isSkyAiGeneralQuestion(message)) {
    return { text: skyAiCapabilitiesReply() };
  }

  const onSellPage = pathname.startsWith("/post/ai");
  if (onSellPage) {
    const hasListingData =
      /\b(sell|selling|for sale|vehicle|rental|service|digital|template|ebook|iphone|ps5|laptop|macbook|car|toyota|bmw|ford|mazda|honda|nissan|lawn|clean|tutor|design|website)\b/i.test(message) ||
      /\$[\d,]+/.test(message) ||
      /\d{4}\s+[A-Za-z]/.test(message) ||
      /(?:^|\n)\w+\s*:/i.test(message);
    if (hasListingData) {
      return {
        text: "Āwhina is temporarily unavailable — the AI can't fill the form right now.\n\nYou can still fill in the title, description, price and category manually below, then click **Post Now** to publish.",
      };
    }
  }

  const rule = getGuideReply(message, pathname);
  const plain = rule.text.replace(/\*\*([^*]+)\*\*/g, "$1");
  if (plain.trim() === SKY_AI_GENERIC_FALLBACK) {
    return { text: skyAiCapabilitiesReply(), navigateTo: rule.navigateTo };
  }
  return { text: plain, navigateTo: rule.navigateTo };
}

export async function checkOpenAiHealth(): Promise<OpenAiHealth> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { configured: false, ready: false, issue: "not_configured", model };
  }

  const now = Date.now();
  if (successCache && now - successCache.at < SUCCESS_CACHE_MS) {
    return successCache.result;
  }
  if (failureCache && now - failureCache.at < FAILURE_CACHE_MS) {
    return failureCache.result;
  }

  const base: OpenAiHealth = { configured: true, ready: false, model };
  try {
    const openai = new OpenAI({ apiKey: key, timeout: OPENAI_PING_TIMEOUT_MS });
    await openai.chat.completions.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const result: OpenAiHealth = { ...base, ready: true };
    successCache = { at: now, result };
    failureCache = null;
    return result;
  } catch (err: unknown) {
    const mapped = openaiErrorResponse(err);
    let issue: OpenAiHealthIssue = "error";
    if (mapped.code === "openai_auth_failed") issue = "auth_failed";
    else if (mapped.code === "openai_quota_exceeded") issue = "quota_exceeded";
    else if (mapped.code === "openai_rate_limit") issue = "rate_limit";

    // Transient ping failures (timeout, rate limit) — assume ChatGPT works; chat will surface real errors.
    if (issue === "rate_limit" || issue === "error") {
      const optimistic: OpenAiHealth = { ...base, ready: true };
      successCache = { at: now, result: optimistic };
      return optimistic;
    }

    const result: OpenAiHealth = { ...base, ready: false, issue };
    failureCache = { at: now, result };
    return result;
  }
}

export function openAiIssueHint(issue: OpenAiHealthIssue | undefined): string {
  switch (issue) {
    case "not_configured":
      return "Add `OPENAI_API_KEY` to `.env.local`, then restart `npm run dev`.";
    case "auth_failed":
      return "OpenAI rejected the API key — create a new key at platform.openai.com/api-keys.";
    case "quota_exceeded":
      return "Sky AI needs OpenAI billing — add payment at platform.openai.com/account/billing.";
    case "rate_limit":
      return "OpenAI rate limit — wait a minute and try again.";
    default:
      return "OpenAI is unreachable right now.";
  }
}
