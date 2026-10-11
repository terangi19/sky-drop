/**
 * Seller rating shown in the listing page trust summary.
 *
 * `profiles/{uid}.averageRating` + `reviewCount` are the only server-maintained aggregates
 * (written by `incrementProfileReviewAggregates` in /api/submit-review) and are part of the
 * public profile shape. Nothing writes `reviewAverage`, so the old read always fell back to a
 * fake "5.0".
 *
 * Mirrors the seller page (`app/seller/[username]/page.tsx`): profile aggregates first, then the
 * client-computed review stats as a fallback for sellers whose reviews predate the aggregates.
 */
export type SellerRatingSummary =
  | { kind: "rated"; average: number; count: number; label: string }
  | { kind: "none"; label: string };

export const NO_REVIEWS_LABEL = "No reviews yet";

function finitePositive(value: unknown): number | null {
  const n = typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sellerRatingSummary(
  profile: { averageRating?: unknown; reviewCount?: unknown } | null | undefined,
  fallback?: { avg: number; count: number } | null
): SellerRatingSummary {
  const profileCount = finitePositive(profile?.reviewCount);
  const profileAvg = finitePositive(profile?.averageRating);
  let average: number | null = null;
  let count: number | null = null;
  if (profileCount && profileAvg) {
    average = profileAvg;
    count = Math.floor(profileCount);
  } else if (fallback && finitePositive(fallback.count) && finitePositive(fallback.avg)) {
    average = fallback.avg;
    count = Math.floor(fallback.count);
  }
  if (average == null || count == null || count < 1) {
    return { kind: "none", label: NO_REVIEWS_LABEL };
  }
  const clamped = Math.min(5, Math.max(1, average));
  return {
    kind: "rated",
    average: clamped,
    count,
    label: `★ ${clamped.toFixed(1)} (${count} review${count === 1 ? "" : "s"})`,
  };
}
