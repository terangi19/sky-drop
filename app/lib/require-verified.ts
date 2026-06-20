import { DecodedIdToken } from "firebase-admin/auth";

export function requireVerifiedEmail(
  token: DecodedIdToken,
  action = "complete this action"
): { ok: true } | { ok: false; error: string } {
  if (!token.email_verified) {
    return {
      ok: false,
      error: `Please verify your email before ${action}.`,
    };
  }
  return { ok: true };
}
