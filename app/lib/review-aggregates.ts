import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

/** Hard cap on reviews read per recompute (a profile with more is far beyond V1 scale). */
export const REVIEW_AGGREGATE_MAX_DOCS = 1000;

/** Ratings that count: finite numbers in 1..5 (firestore.rules don't validate `rating` on update). */
export function validReviewRating(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

/**
 * Aggregate from source: average rounded to 0.1 (same rounding as the old rolling increment).
 * Mirrors functions/src/review-aggregates.ts (parity is tested).
 */
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

/**
 * Recompute profiles/{revieweeId}.averageRating + reviewCount from the `reviews` docs that name
 * this user as reviewee (`revieweeId`), inside a transaction. Idempotent: safe to call after any
 * create / edit / delete, and self-healing if an earlier write was missed.
 *
 * Keyed on `revieweeId`, so reviews the user WROTE are never counted, and filtered with
 * `isSellerRatingReview`, so reviews the user RECEIVED AS A BUYER (seller -> buyer) are excluded too:
 * `averageRating` / `reviewCount` are shown publicly as the SELLER rating. Field names unchanged.
 */
export async function recomputeProfileReviewAggregates(revieweeId: string): Promise<{
  averageRating: number;
  reviewCount: number;
} | null> {
  if (!revieweeId) return null;
  const db = getAdminDb();
  const profileRef = db.collection("profiles").doc(revieweeId);
  const reviewsQuery = db
    .collection("reviews")
    .where("revieweeId", "==", revieweeId)
    .limit(REVIEW_AGGREGATE_MAX_DOCS);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewsQuery);
    const agg = computeSellerReviewAggregates(
      snap.docs.map((d) => ({
        rating: d.get("rating"),
        role: d.get("role"),
        revieweeEmail: d.get("revieweeEmail"),
        sellerEmail: d.get("sellerEmail"),
      }))
    );
    tx.set(
      profileRef,
      { ...agg, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return agg;
  });
}

/**
 * Called by /api/submit-review after a new review is written. Kept for the existing call site
 * (and PR #106) but now recomputes from source instead of a rolling increment, so it can no
 * longer drift when a review is edited or deleted elsewhere. `_rating` is unused (the new doc is
 * read back by the recompute).
 */
export async function incrementProfileReviewAggregates(
  revieweeId: string,
  _rating?: number
): Promise<void> {
  await recomputeProfileReviewAggregates(revieweeId);
}
