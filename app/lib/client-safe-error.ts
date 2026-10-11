/**
 * PROMPT-16: map a caught error to a response body that never carries internal text
 * (Firestore REST bodies, Stripe/OpenAI messages, stack traces, env hints).
 *
 * Only messages we wrote ourselves for users (purchase-service, listing-stock, checkout-server)
 * pass through; everything else becomes the route's generic fallback with status 500.
 * Log the original server-side before calling this.
 */
export type ClientSafeError = { error: string; status: number };

const NOT_FOUND = new Set([
  "Listing not found",
  "Purchase not found",
  "Offer message not found",
  "Conversation not found",
]);

const FORBIDDEN = new Set([
  "You are not the buyer for this purchase",
  "You are not the seller of this listing",
]);

const BAD_REQUEST = new Set([
  "Listing has no seller",
  "Message is not an offer",
  "Payment deadline has passed. Please ask the seller to re-accept your offer.",
  "This listing has already been sold to another buyer",
  "This listing has already been sold",
  "This listing has expired",
  "This listing is no longer available",
  "This item is out of stock",
  "You cannot accept your own offer",
  "You cannot purchase your own listing",
]);

/** Our own templated messages; the variable part is a short status word, never free text. */
const PATTERNS: Array<[RegExp, number]> = [
  [/^Offer is already [a-z_]{1,32}$/, 400],
  [/^Cannot pay for purchase with status "[a-z_]{0,32}"$/, 400],
];

export function clientSafeError(e: unknown, fallback: string): ClientSafeError {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (NOT_FOUND.has(msg)) return { error: msg, status: 404 };
  if (FORBIDDEN.has(msg)) return { error: msg, status: 403 };
  if (BAD_REQUEST.has(msg)) return { error: msg, status: 400 };
  for (const [re, status] of PATTERNS) if (re.test(msg)) return { error: msg, status };
  return { error: fallback, status: 500 };
}

/** HTTP status from an error-like value, only if it is a real HTTP status (Firestore codes are not). */
export function httpStatusOr(e: unknown, fallback = 500): number {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" && Number.isInteger(s) && s >= 400 && s <= 599 ? s : fallback;
}
