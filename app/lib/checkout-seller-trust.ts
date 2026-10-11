/**
 * Seller trust hints shown in the checkout modal (rating chip + "typically responds within …").
 *
 * They come from the PUBLIC profile (GET/POST /api/public-profile[s], Admin SDK). The old code did a client
 * getDoc(profiles/{sellerId}), which firestore.rules deny to every buyer, and read two fields that no profile has
 * (`sellerRating`, `averageResponseTime`). The real public fields are `averageRating` + `reviewCount` (written by
 * submit-review via review-aggregates.ts) and `responseTime` (in PUBLIC_PROFILE_FIELDS; nothing writes it today).
 */
import { fetchPublicProfileBySlug } from "./fetch-public-profile-client";

export type CheckoutSellerTrust = {
  /** 1-decimal average, only when the seller really has reviews */
  rating: number | null;
  responseTime: string | null;
};

export const NO_SELLER_TRUST: CheckoutSellerTrust = { rating: null, responseTime: null };

export function checkoutSellerTrustFromProfile(
  profile: { averageRating?: unknown; reviewCount?: unknown; responseTime?: unknown } | null | undefined
): CheckoutSellerTrust {
  if (!profile) return NO_SELLER_TRUST;
  const avg = profile.averageRating;
  const count = profile.reviewCount;
  const rating =
    typeof avg === "number" && Number.isFinite(avg) && avg > 0 && typeof count === "number" && count > 0 ? avg : null;
  // Only a ready-made label is shown. A bare number has no known unit (nothing writes this field), so it is ignored.
  const rt = typeof profile.responseTime === "string" ? profile.responseTime.trim() : "";
  return { rating, responseTime: rt || null };
}

/** Never throws; any failure just means no hints. */
export async function loadCheckoutSellerTrust(sellerId: string): Promise<CheckoutSellerTrust> {
  const id = String(sellerId || "").trim();
  if (!id) return NO_SELLER_TRUST;
  try {
    return checkoutSellerTrustFromProfile(await fetchPublicProfileBySlug(id));
  } catch {
    return NO_SELLER_TRUST;
  }
}
