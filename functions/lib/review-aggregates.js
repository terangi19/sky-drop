"use strict";
/**
 * Pure helpers for profile review aggregates (profiles/{uid}.averageRating + reviewCount).
 * Kept dependency-free so the Next app (app/lib/review-aggregates.ts mirrors it) and the
 * vitest suite can use the same rules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validReviewRating = validReviewRating;
exports.computeReviewAggregates = computeReviewAggregates;
exports.reviewAggregateInputsChanged = reviewAggregateInputsChanged;
/** Ratings that count: finite numbers in 1..5 (firestore.rules don't validate `rating` on update). */
function validReviewRating(value) {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 5)
        return null;
    return n;
}
/** Aggregate from source: average rounded to 0.1 (same rounding as the old rolling increment). */
function computeReviewAggregates(ratings) {
    const valid = ratings.map(validReviewRating).filter((r) => r != null);
    if (valid.length === 0)
        return { averageRating: 0, reviewCount: 0 };
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    return { averageRating: Math.round(avg * 10) / 10, reviewCount: valid.length };
}
/** True when a review write can change the reviewee's aggregate (rating or reviewee changed). */
function reviewAggregateInputsChanged(before, after) {
    if (!before || !after)
        return true;
    return before.rating !== after.rating || before.revieweeId !== after.revieweeId;
}
//# sourceMappingURL=review-aggregates.js.map