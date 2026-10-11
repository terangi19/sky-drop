/**
 * Pure helpers for profile review aggregates (profiles/{uid}.averageRating + reviewCount).
 * Kept dependency-free so the Next app (app/lib/review-aggregates.ts mirrors it) and the
 * vitest suite can use the same rules.
 */

/** Ratings that count: finite numbers in 1..5 (firestore.rules don't validate `rating` on update). */
export function validReviewRating(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/** Aggregate from source: average rounded to 0.1 (same rounding as the old rolling increment). */
export function computeReviewAggregates(ratings: readonly unknown[]): {
  averageRating: number;
  reviewCount: number;
} {
  const valid = ratings.map(validReviewRating).filter((r): r is number => r != null);
  if (valid.length === 0) return { averageRating: 0, reviewCount: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return { averageRating: Math.round(avg * 10) / 10, reviewCount: valid.length };
}

/** Fields of a `reviews` doc that say which side of the sale the reviewee was on. */
export type ReviewRoleFields = {
  rating?: unknown;
  role?: unknown;
  revieweeEmail?: unknown;
  sellerEmail?: unknown;
};

/**
 * True when the review was received by the reviewee AS THE SELLER, i.e. it counts towards the
 * public seller rating (profiles.averageRating / reviewCount).
 *
 * Same discrimination as `isReviewReceivedBySeller` (app/lib/review-role.ts, PR #111 /
 * REVIEW-STATS-REVIEWER-ROLE): /api/submit-review writes `role` = the REVIEWER's role
 * ("buyer" | "seller") plus the purchase's `sellerEmail` on both directions.
 * - `role: "seller"` -> the seller reviewed the buyer -> the reviewee was the buyer -> excluded;
 * - `revieweeEmail` present but not the purchase's `sellerEmail` -> reviewee was the buyer -> excluded;
 * - legacy docs without role/revieweeEmail (buyer -> seller, pre two-way reviews) -> kept.
 */
export function isSellerRatingReview(data: ReviewRoleFields | null | undefined): boolean {
  if (!data) return false;
  if (data.role === "seller") return false;
  const seller = typeof data.sellerEmail === "string" ? data.sellerEmail.trim().toLowerCase() : "";
  const reviewee = typeof data.revieweeEmail === "string" ? data.revieweeEmail.trim().toLowerCase() : "";
  if (reviewee && seller && reviewee !== seller) return false;
  return true;
}

/** Seller-rating aggregate from raw review docs: buyer-side reviews are excluded, not just ignored by rating. */
export function computeSellerReviewAggregates(docs: readonly (ReviewRoleFields | null | undefined)[]): {
  averageRating: number;
  reviewCount: number;
} {
  return computeReviewAggregates(docs.filter(isSellerRatingReview).map((d) => d?.rating));
}

/** True when a review write can change the reviewee's seller aggregate (rating, reviewee or role fields changed). */
export function reviewAggregateInputsChanged(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!before || !after) return true;
  return (
    before.rating !== after.rating ||
    before.revieweeId !== after.revieweeId ||
    before.role !== after.role ||
    before.revieweeEmail !== after.revieweeEmail ||
    before.sellerEmail !== after.sellerEmail
  );
}
