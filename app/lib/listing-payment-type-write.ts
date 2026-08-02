/**
 * Enforce listing paymentType on create/update when Stripe Checkout is disabled.
 * Server flag is authoritative — never trust client stripe requests.
 */
import { isStripeCheckoutEnabledServer } from "./stripe-checkout-flags";
import { normalizePaymentType, type ListingPaymentType } from "./listing-payment-type";

export function resolveListingPaymentTypeForWrite(
  requested: unknown
): ListingPaymentType {
  if (!isStripeCheckoutEnabledServer()) {
    return "contact";
  }
  return normalizePaymentType(requested);
}
