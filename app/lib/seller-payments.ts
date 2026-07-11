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

/** Check if seller has Stripe configured for Pay Now */
export function sellerHasStripeConfigured(
  sellerProfile: SellerProfileSlice | undefined | null
): boolean {
  if (!sellerProfile) return false;
  return !!sellerProfile.stripeAccountId;
}

export type StripeKeyMode = "test" | "live";

export function getPublishableKeyMode(publishableKey?: string): StripeKeyMode | null {
  const key = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return null;
}

/** True when profile has a Connect account for the current publishable-key environment. */
export function sellerStripeMatchesPlatform(
  profile: (SellerProfileSlice & { stripeAccountKeyMode?: string }) | null | undefined
): boolean {
  if (!profile?.stripeAccountId) return false;
  const platform = getPublishableKeyMode();
  const stored = profile.stripeAccountKeyMode;
  if (platform && stored) return platform === stored;
  return true;
}

export function sellerCanUseStripeCheckout(
  profile: (SellerProfileSlice & { stripeAccountKeyMode?: string }) | null | undefined
): boolean {
  return sellerHasStripeConfigured(profile) && sellerStripeMatchesPlatform(profile);
}

export const STRIPE_CONNECT_REQUIRED_MSG =
  "Connect Stripe in Profile → Payouts before using Stripe Checkout on listings.";

/** Block Stripe Checkout listings when seller has not connected payouts. */
export function stripeListingPublishError(
  sellerProfile: SellerProfileSlice | undefined | null
): string | null {
  if (!sellerProfile?.stripeAccountId) {
    return STRIPE_CONNECT_REQUIRED_MSG;
  }
  if (sellerProfile.restricted) {
    return "Your seller account is restricted — Stripe Checkout listings are not allowed.";
  }
  return null;
}
