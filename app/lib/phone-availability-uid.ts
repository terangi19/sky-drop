/**
 * Phone availability may exclude the caller's own number.
 * Never trust a client-supplied uid — only a verified token uid.
 */
export function resolvePhoneAvailabilityExcludeUid(opts: {
  tokenUid?: string | null;
  bodyUid?: unknown;
}): string {
  void opts.bodyUid;
  const token = typeof opts.tokenUid === "string" ? opts.tokenUid.trim() : "";
  return token;
}
