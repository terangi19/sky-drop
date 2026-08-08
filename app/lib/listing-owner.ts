/** Listing ownership ID fields used across legacy and current docs. */
export type ListingOwnerFields = {
  sellerId?: string | null;
  userId?: string | null;
  ownerId?: string | null;
  sellerUid?: string | null;
  uid?: string | null;
};

/**
 * Canonical listing owner UID with legacy field compatibility.
 * Prefer sellerId (current create-listing), then older owner/user aliases.
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
