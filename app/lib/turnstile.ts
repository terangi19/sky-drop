const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileSiteKey(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  }
  return "";
}

export function getTurnstileSecretKey(): string {
  if (typeof process !== "undefined" && process.env.TURNSTILE_SECRET_KEY) {
    return process.env.TURNSTILE_SECRET_KEY;
  }
  return "";
}

export function isTurnstileConfigured(): boolean {
  return !!(getTurnstileSiteKey() && getTurnstileSecretKey());
}

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = getTurnstileSecretKey();
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification");
    return true;
  }

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error("[turnstile] Verification request failed:", e);
    return false;
  }
}
