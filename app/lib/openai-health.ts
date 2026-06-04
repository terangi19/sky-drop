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

let cache: { at: number; result: OpenAiHealth } | null = null;
const CACHE_MS = 60_000;

/** Rule-based reply when OpenAI is unavailable — avoid useless generic one-liner. */
export function skyAiRuleFallbackText(
  message: string,
  pathname: string
): { text: string; navigateTo?: string } {
  if (isSkyAiGeneralQuestion(message)) {
    return { text: skyAiCapabilitiesReply() };
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
  if (cache && now - cache.at < CACHE_MS) {
    return cache.result;
  }

  const base: OpenAiHealth = { configured: true, ready: false, model };
  try {
    const openai = new OpenAI({ apiKey: key });
    await openai.chat.completions.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const result: OpenAiHealth = { ...base, ready: true };
    cache = { at: now, result };
    return result;
  } catch (err: unknown) {
    const mapped = openaiErrorResponse(err);
    let issue: OpenAiHealthIssue = "error";
    if (mapped.code === "openai_auth_failed") issue = "auth_failed";
    else if (mapped.code === "openai_quota_exceeded") issue = "quota_exceeded";
    else if (mapped.code === "openai_rate_limit") issue = "rate_limit";
    const result: OpenAiHealth = { ...base, ready: false, issue };
    cache = { at: now, result };
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
      return "Your OpenAI API account has no credits or billing. Add payment at platform.openai.com/account/billing (this is separate from ChatGPT Plus).";
    case "rate_limit":
      return "OpenAI rate limit — wait a minute and try again.";
    default:
      return "OpenAI is unreachable right now.";
  }
}
