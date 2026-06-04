/**
 * Client-safe listing availability (no firebase-admin).
 * Use for UI filters and checkout — keep in sync with listing-stock.ts server logic.
 */

export type ListingAvailabilityFields = {
  status?: string;
  stockQuantity?: number | string | null;
};

export function listingTracksStock(listing: ListingAvailabilityFields): boolean {
  const stock = listing.stockQuantity;
  return stock != null && stock !== "";
}

export function listingStockCount(listing: ListingAvailabilityFields): number | null {
  if (!listingTracksStock(listing)) return null;
  const qty = Number(listing.stockQuantity);
  return Number.isFinite(qty) ? qty : 0;
}

/** Listing should appear in marketplace browse/search. */
export function isListingVisibleInMarketplace(listing: ListingAvailabilityFields): boolean {
  const stock = listingStockCount(listing);
  if (stock !== null) return stock > 0;
  return listing.status !== "sold";
}

/** Buyer can still purchase (stock or single-unit not sold). */
export function isListingAvailableForPurchase(listing: ListingAvailabilityFields): boolean {
  const stock = listingStockCount(listing);
  if (stock !== null) return stock > 0;
  return listing.status !== "sold";
}

export function formatStockLabel(listing: ListingAvailabilityFields): string | null {
  const stock = listingStockCount(listing);
  if (stock === null) return null;
  if (stock <= 0) return "Out of stock";
  return stock === 1 ? "1 available" : `${stock} available`;
}
