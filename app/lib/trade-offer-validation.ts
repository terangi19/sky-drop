/**
 * Pure helpers for POST /api/trade-offer.
 *
 * No firebase-admin / next imports on purpose: the decision logic is unit-testable
 * without mocks and the module is safe to import from client code.
 */

export type TradeOfferFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

/** Per-buyer limits enforced in the route via `rateLimit()` (Upstash, in-memory fallback). */
export const TRADE_OFFER_LIMITS = {
  /** Max offers a single signed-in user may send across all posts per window. */
  perUser: { max: 20, windowMs: 60 * 60 * 1000 },
  /** Max offers a single signed-in user may send on one post per window. */
  perUserPost: { max: 3, windowMs: 60 * 60 * 1000 },
} as const;

/** Statuses on which a trade post no longer accepts offers (matches manage-trade-post statuses + expired). */
export const TRADE_OFFER_CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "sold",
  "completed",
  "closed",
  "expired",
]);

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_POST_ID_LENGTH = 128;

function fail(status: number, code: string, error: string): TradeOfferFailure {
  return { ok: false, status, code, error };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Strip control characters (incl. newlines) and cap length for text that ends up in a notification. */
export function sanitizeNotificationText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return str(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export type ParsedTradeOfferBody = { ok: true; postId: string; requestId?: string };

/**
 * Validate the JSON body. The client sends only `{ postId, requestId? }`:
 * the seller, title and image are always re-read from the post on the server.
 */
export function parseTradeOfferBody(body: unknown): ParsedTradeOfferBody | TradeOfferFailure {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "bad_body", "Invalid request");
  }
  const raw = body as Record<string, unknown>;
  const postId = str(raw.postId);
  if (!postId) return fail(400, "post_id_required", "postId is required");
  // Firestore doc ids cannot contain "/", cannot be "." / "..", and "__x__" ids are reserved.
  if (
    postId.length > MAX_POST_ID_LENGTH ||
    postId.includes("/") ||
    postId === "." ||
    postId === ".." ||
    /^__.*__$/.test(postId)
  ) {
    return fail(400, "post_id_invalid", "Invalid postId");
  }
  let requestId: string | undefined;
  if (raw.requestId !== undefined && raw.requestId !== null) {
    const candidate = str(raw.requestId);
    if (!REQUEST_ID_RE.test(candidate)) {
      return fail(400, "request_id_invalid", "Invalid requestId");
    }
    requestId = candidate;
  }
  return { ok: true, postId, requestId };
}

export type TradePostLike = {
  sellerEmail?: unknown;
  sellerId?: unknown;
  sellerUid?: unknown;
  status?: unknown;
  title?: unknown;
  images?: unknown;
  image?: unknown;
} | null | undefined;

export type TradeOfferDecision = {
  ok: true;
  sellerEmail: string;
  title: string;
  image: string;
};

function firstHttpUrl(post: NonNullable<TradePostLike>): string {
  const candidates: unknown[] = [Array.isArray(post.images) ? post.images[0] : undefined, post.image];
  for (const c of candidates) {
    const url = str(c);
    if (url && url.length <= 2048 && /^https?:\/\//i.test(url)) return url;
  }
  return "";
}

/**
 * Decide whether `buyer` may send an offer on `post`. Pure: no I/O.
 * - 404 missing post, 409 closed / no seller, 400 own post, 400 buyer without email.
 */
export function decideTradeOffer(
  post: TradePostLike,
  buyer: { uid?: string | null; email?: string | null }
): TradeOfferDecision | TradeOfferFailure {
  const buyerEmail = str(buyer.email).toLowerCase();
  const buyerUid = str(buyer.uid);
  if (!buyerUid || !buyerEmail) {
    return fail(400, "buyer_identity_missing", "Your account needs an email address to send offers.");
  }
  if (!post) {
    return fail(404, "post_not_found", "This trade post is no longer available.");
  }
  const sellerEmail = str(post.sellerEmail).toLowerCase();
  if (!sellerEmail) {
    return fail(409, "post_has_no_seller", "This trade post can't receive offers.");
  }
  const sellerUids = [str(post.sellerId), str(post.sellerUid)].filter(Boolean);
  if (sellerEmail === buyerEmail || sellerUids.includes(buyerUid)) {
    return fail(400, "own_post", "You can't send an offer on your own post.");
  }
  const status = str(post.status).toLowerCase();
  if (TRADE_OFFER_CLOSED_STATUSES.has(status)) {
    return fail(409, "post_closed", "This trade is no longer open for offers.");
  }
  return {
    ok: true,
    sellerEmail,
    title: sanitizeNotificationText(post.title, 120) || "a trade",
    image: firstHttpUrl(post),
  };
}

/** Seller notification body. Buyer label is derived server-side (profile username or email local part). */
export function buildTradeOfferNotification(input: {
  buyerLabel: unknown;
  buyerEmail: string;
  postTitle: string;
}): { title: string; message: string } {
  const label =
    sanitizeNotificationText(input.buyerLabel, 40) ||
    sanitizeNotificationText(input.buyerEmail.split("@")[0], 40) ||
    "Someone";
  return {
    title: "New offer received! 💰",
    message: `${label} sent an offer on "${input.postTitle}".`,
  };
}
