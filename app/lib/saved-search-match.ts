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
};

export type SavedSearchListingFacts = {
  /** Lower-cased listing title. */
  titleLower: string;
  /** Lower-cased listing category. */
  categoryLower: string;
};

/**
 * Same rule the route has always used: the query (if any) must be a
 * case-insensitive substring of the title, and the category must be "all"
 * (or missing) or equal the listing category, case-insensitively.
 */
export function savedSearchMatchesListing(
  search: SavedSearchCriteria,
  listing: SavedSearchListingFacts
): boolean {
  const q = String(search.query || "").toLowerCase();
  const cat = String(search.category || "All").toLowerCase();
  const matchesQuery = !q || listing.titleLower.includes(q);
  const matchesCategory = cat === "all" || listing.categoryLower === cat;
  return matchesQuery && matchesCategory;
}
