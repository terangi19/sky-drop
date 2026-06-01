/** Shared seller payout / trust checks for payment routes. */

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
