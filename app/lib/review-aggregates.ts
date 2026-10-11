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

/**
 * Recompute profiles/{revieweeId}.averageRating + reviewCount from the `reviews` docs that name
 * this user as reviewee (`revieweeId`), inside a transaction. Idempotent: safe to call after any
 * create / edit / delete, and self-healing if an earlier write was missed.
 *
 * Keyed on `revieweeId`, so reviews the user WROTE (e.g. as seller about a buyer, which still carry
 * the legacy `sellerEmail`) are never counted — the reviewer-role problem fixed client-side by the
 * REVIEW-STATS-REVIEWER-ROLE pack does not arise here.
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
    const agg = computeReviewAggregates(snap.docs.map((d) => d.get("rating")));
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
