/** Map OpenAI SDK errors to user-safe messages (never expose raw stack). */

export function openaiErrorResponse(err: unknown): {
  status: number;
  error: string;
  code: string;
} {
  const oai = err as { status?: number; message?: string };
  const msg = String(oai.message || "");

  if (oai.status === 401) {
    return {
      status: 401,
      code: "openai_auth_failed",
      error:
        "OpenAI rejected your API key. Create a new key at platform.openai.com/api-keys.",
    };
  }

  if (oai.status === 429 && /quota|billing|insufficient/i.test(msg)) {
    return {
      status: 429,
      code: "openai_quota_exceeded",
      error:
        "Your OpenAI account has no paid credits left (or no billing on file). Sky Drop cannot call ChatGPT until you add billing or top up at platform.openai.com/account/billing.",
    };
  }

  if (oai.status === 429) {
    return {
      status: 429,
      code: "openai_rate_limit",
      error: "OpenAI rate limit — wait a minute and try again.",
    };
  }

  return {
    status: oai.status && oai.status >= 400 ? oai.status : 500,
    code: "openai_error",
    error: msg || "OpenAI request failed",
  };
}
