type VerifiedEmailTokenLike = {
  email_verified?: boolean;
};

export function requireVerifiedEmail(
  token: VerifiedEmailTokenLike,
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
