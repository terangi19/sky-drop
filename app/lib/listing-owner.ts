/** Listing ownership ID fields used across legacy and current docs. */
export type ListingOwnerFields = {
  sellerId?: string | null;
  userId?: string | null;
  ownerId?: string | null;
  sellerUid?: string | null;
  uid?: string | null;
  /** Legacy only — never preferred over UID fields; used when no UID exists. */
  sellerEmail?: string | null;
};

/**
 * Canonical listing owner UID with legacy field compatibility.
 * Prefer sellerId (current create-listing), then older owner/user aliases.
 * sellerEmail is last-resort for enrichment keying when UID fields are absent
 * (batch profile API resolves email → profile; never shown as a card label).
 */
export function getListingOwnerId(
  listing: ListingOwnerFields | null | undefined
): string {
  if (!listing) return "";
  for (const raw of [
    listing.sellerId,
    listing.userId,
    listing.ownerId,
    listing.sellerUid,
    listing.uid,
  ]) {
    const id = String(raw || "").trim();
    if (id) return id;
  }
  return "";
}

/** Owner UID if present, else sellerEmail for legacy email-only listings. */
export function getListingOwnerLookupKey(
  listing: ListingOwnerFields | null | undefined
): string {
  const uid = getListingOwnerId(listing);
  if (uid) return uid;
  return String(listing?.sellerEmail || "").trim();
}
