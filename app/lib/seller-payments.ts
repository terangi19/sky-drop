/** Shared seller payout / trust checks for payment routes. */

export type PurchaseEarningsSlice = {
  status?: string;
  total?: number;
  paymentType?: string;
  stripePaymentIntentId?: string;
};

/** True when the buyer paid through Stripe Checkout (not Arrange Purchase). */
export function isStripeCheckoutPurchase(purchase: PurchaseEarningsSlice): boolean {
  if (String(purchase.paymentType || "") === "contact") return false;
  if (purchase.stripePaymentIntentId) return true;
  return String(purchase.paymentType || "stripe") !== "contact";
}

/** Sum order totals for Stripe Checkout sales in the given statuses (e.g. delivered). */
export function sumStripeCheckoutEarnings(
  purchases: PurchaseEarningsSlice[],
  statuses: string[] = ["delivered"]
): number {
  const allowed = new Set(statuses.map((s) => s.toLowerCase()));
  return purchases
    .filter(
      (p) =>
        allowed.has(String(p.status || "").toLowerCase()) &&
        isStripeCheckoutPurchase(p)
    )
    .reduce((sum, p) => sum + (Number(p.total) || 0), 0);
}

export type SellerProfileSlice = {
  restricted?: boolean;
  emailVerified?: boolean;
  stripeAccountId?: string;
};

export function validateSellerForCheckout(
  sellerProfile: SellerProfileSlice | undefined | null
): string | null {
  if (!sellerProfile) {
    return "This seller has not set up payouts yet.";
  }
  if (sellerProfile.restricted) {
    return "This seller is restricted.";
  }
  if (sellerProfile.emailVerified === false) {
    return "Seller has not verified their email.";
  }
  if (!sellerProfile.stripeAccountId) {
    return "This seller has not set up payouts yet.";
  }
  return null;
}
