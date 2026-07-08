/** Map OpenAI SDK errors to user-safe messages (never expose raw stack). */

const FRIENDLY_FALLBACK =
  "Āwhina hit a snag — wait a moment and try again. If it keeps happening, refresh the page.";

export function openaiErrorResponse(err: unknown): {
  status: number;
  error: string;
  code: string;
} {
  const oai = err as { status?: number; message?: string };
  const msg = String(oai.message || "");

  if (oai.status === 401) {
    return {
      status: 503,
      code: "openai_auth_failed",
      error:
        "Āwhina is temporarily unavailable. Please try again in a few minutes — your draft is still saved on the Sell page.",
    };
  }

  if (oai.status === 429 && /quota|billing|insufficient/i.test(msg)) {
    return {
      status: 503,
      code: "openai_quota_exceeded",
      error:
        "Āwhina is busy right now — try again in a minute. You can still edit the form manually while you wait.",
    };
  }

  if (oai.status === 429) {
    return {
      status: 429,
      code: "openai_rate_limit",
      error: "Too many requests — wait a minute and try again. Your message wasn't lost.",
    };
  }

  if (oai.status === 503 || oai.status === 502 || oai.status === 504) {
    return {
      status: 503,
      code: "openai_unavailable",
      error: `${FRIENDLY_FALLBACK} You can keep filling the form by hand.`,
    };
  }

  return {
    status: oai.status && oai.status >= 400 ? oai.status : 500,
    code: "openai_error",
    error: FRIENDLY_FALLBACK,
  };
}
