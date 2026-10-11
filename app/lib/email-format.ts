/**
 * Shared email *format* check (not deliverability). Same acceptance as the old
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` for inputs up to EMAIL_MAX_LENGTH, but:
 *  - the input is capped at 254 chars (RFC 5321 path limit) BEFORE anything runs, and
 *  - the check is a linear scan, so hostile input (e.g. "a@" + "." x 1e6) is O(n) and bounded.
 * The old regex backtracks quadratically: ~2 s at 40k chars, minutes at 1 MB.
 */
export const EMAIL_MAX_LENGTH = 254;

const WHITESPACE = /\s/;

export function isValidEmailFormat(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length < 3 || value.length > EMAIL_MAX_LENGTH) return false;
  if (WHITESPACE.test(value)) return false; // linear, no backtracking
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false; // exactly one "@", non-empty local part
  const domain = value.slice(at + 1);
  // A "." with at least one char before it and one after it inside the domain.
  const dot = domain.indexOf(".", 1);
  return dot !== -1 && dot < domain.length - 1;
}
