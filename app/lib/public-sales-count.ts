/**
 * Seller sales count shown to OTHER users (seller page "Completed sales", chat header "N sales").
 *
 * Source: the public profile's `salesCount` (in PUBLIC_PROFILE_FIELDS; incremented server-side by
 * seller-sales-admin.ts from createPurchaseWithAdmin and /api/confirm-arrange-sale). Never a client
 * `purchases where sellerEmail ==` scan: firestore.rules only let the buyer or the seller read a
 * purchase, so that query is denied for every other viewer.
 */
export function publicSalesCount(profile: { salesCount?: unknown } | null | undefined): number {
  const n = profile?.salesCount;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
