function asId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emailsMatch(left: string, right: string): boolean {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
}

/** Canonical seller uid: `sellerUid`, else legacy `sellerId`, else empty. */
export function resolveSellerUid(listing: {
  sellerUid?: unknown;
  sellerId?: unknown;
}): string {
  return asId(listing.sellerUid) || asId(listing.sellerId);
}

/**
 * Own-listing check. Uid wins when the listing has a seller uid.
 * Listings with no seller uid fall back to a case-insensitive email compare.
 */
export function isOwnListing(input: {
  bidderUid: string;
  bidderEmail: string;
  sellerUid: string;
  sellerEmail: string;
}): boolean {
  const sellerUid = input.sellerUid.trim();
  if (sellerUid) return input.bidderUid.trim() === sellerUid;
  return emailsMatch(input.bidderEmail, input.sellerEmail);
}

/**
 * Same-bidder check. Uid wins when a highest-bidder uid is stored.
 * Legacy rows with only an email fall back to a case-insensitive compare.
 * Empty identity is never "the same bidder".
 */
export function isSameBidder(input: {
  bidderUid: string;
  bidderEmail: string;
  highestBidderUid: string;
  highestBidderEmail: string;
}): boolean {
  const highestBidderUid = input.highestBidderUid.trim();
  if (highestBidderUid) return input.bidderUid.trim() === highestBidderUid;
  return emailsMatch(input.bidderEmail, input.highestBidderEmail);
}

export function hasHighestBidder(uid: string, email: string): boolean {
  return Boolean(uid.trim() || email.trim());
}
