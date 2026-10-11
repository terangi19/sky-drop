/**
 * Single matcher for "does this new listing match a saved search?".
 *
 * Saved-search notifications are sent ONLY by `POST /api/create-listing`
 * (runCreateListingSideEffects). The `onListingCreated` Cloud Function no longer
 * notifies, so a listing cannot produce two `saved_search_match` notifications.
 * Pure (no Firestore) so it can be unit-tested.
 */

export type SavedSearchCriteria = {
  query?: unknown;
  category?: unknown;
  /** Optional lower price bound (number or numeric string). */
  minPrice?: unknown;
  /** Optional upper price bound (number or numeric string). */
  maxPrice?: unknown;
};

export type SavedSearchListingFacts = {
  /** Lower-cased listing title. */
  titleLower: string;
  /**
   * Lower-cased STORED listing category (listings/{id}.category), built with
   * `storedListingCategoryLower` (vehicles are stored as "Cars").
   */
  categoryLower: string;
  /** Listing price as stored on the listing doc (route stores a numeric string). */
  price?: unknown;
};

/**
 * Price bounds, copied EXACTLY from the retired `onListingCreated` Cloud Function
 * (functions/src/index.ts at 2710505, lines 87 and 101-103):
 *
 *   price    = Number(listing.price)   || 0
 *   minPrice = Number(search.minPrice) || 0
 *   maxPrice = Number(search.maxPrice) || Infinity
 *   reject if price > 0 && (price < minPrice || price > maxPrice)
 *
 * So: bounds are INCLUSIVE; a missing / null / "" / 0 / non-numeric (NaN) bound
 * means "no bound" (a max of 0 is therefore NO upper bound); numeric strings are
 * coerced; a listing whose price is missing, 0 or non-numeric is never excluded
 * by price.
 */
export function savedSearchMatchesPrice(
  search: Pick<SavedSearchCriteria, "minPrice" | "maxPrice">,
  listingPrice: unknown
): boolean {
  const price = Number(listingPrice) || 0;
  const minPrice = Number(search.minPrice) || 0;
  const maxPrice = Number(search.maxPrice) || Infinity;
  return !(price > 0 && (price < minPrice || price > maxPrice));
}

/**
 * Listing side of the category comparison, copied from the retired Cloud Function
 * (functions/src/index.ts at 2710505, line 86): `String(data.category || "").toLowerCase()`
 * applied to the STORED listing category. No trimming.
 */
export function storedListingCategoryLower(storedCategory: unknown): string {
  return String(storedCategory || "").toLowerCase();
}

/**
 * Query (if any) must be a case-insensitive substring of the title. The category
 * must be "all", or empty/missing, or equal the STORED listing category,
 * case-insensitively with no trimming (old Cloud Function, 2710505
 * functions/src/index.ts lines 94 and 98). The listing price must satisfy the
 * saved search's optional min/max bounds (old Cloud Function rule, see above).
 */
export function savedSearchMatchesListing(
  search: SavedSearchCriteria,
  listing: SavedSearchListingFacts
): boolean {
  const q = String(search.query || "").toLowerCase();
  const searchCategory = String(search.category || "").toLowerCase();
  const matchesQuery = !q || listing.titleLower.includes(q);
  const matchesCategory =
    searchCategory === "all" || searchCategory === "" || searchCategory === listing.categoryLower;
  return matchesQuery && matchesCategory && savedSearchMatchesPrice(search, listing.price);
}
