/**
 * Interpret /api/check-email-temp. Fail closed: any non-success or
 * malformed payload must block signup, never look like "email is fine".
 */
export function interpretEmailCheckResponse(
  resOk: boolean,
  status: number,
  data: { disposable?: unknown; error?: unknown }
): { ok: boolean; error?: string } {
  if (!resOk) {
    if (status === 429) {
      return {
        ok: false,
        error: "Too many attempts. Please wait a few minutes and try again.",
      };
    }
    return {
      ok: false,
      error: "We couldn't verify your email. Please try again.",
    };
  }
  if (data.disposable === true) {
    return {
      ok: false,
      error: "Temporary email addresses aren't allowed. Use a permanent email.",
    };
  }
  if (data.disposable === false) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "We couldn't verify your email. Please try again.",
  };
}
