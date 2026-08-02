import { isStripeCheckoutVisibleClient } from "./stripe-checkout-flags";

export function isContactPayment(paymentType?: string | null): boolean {
  return paymentType === "contact" || !isStripeCheckoutVisibleClient();
}

export function primaryPurchaseLabel(opts: {
  paymentType?: string | null;
  price?: string | number | null;
  pricingType?: string | null;
  hasExistingRequest?: boolean;
}): string {
  if (opts.pricingType === "quote") return "Request Quote";
  if (!isStripeCheckoutVisibleClient()) {
    if (opts.hasExistingRequest) return "Open Chat";
    return "Message Seller";
  }
  if (opts.hasExistingRequest && isContactPayment(opts.paymentType)) return "Open Chat";
  const price =
    opts.price != null && opts.price !== "" ? `$${opts.price}` : null;
  if (isContactPayment(opts.paymentType)) {
    return price ? `Contact Seller — ${price}` : "Contact Seller";
  }
  return price ? `Buy Now — ${price}` : "Buy Now";
}

export function shortPurchaseLabel(paymentType?: string | null): string {
  if (!isStripeCheckoutVisibleClient()) return "Message Seller";
  return isContactPayment(paymentType) ? "Contact Seller" : "Buy Now";
}

export function purchaseButtonTitle(paymentType?: string | null): string {
  if (!isStripeCheckoutVisibleClient()) {
    return "Message the seller to arrange payment, pickup, or delivery in chat";
  }
  return isContactPayment(paymentType)
    ? "Message the seller to arrange bank transfer, cash, or pickup"
    : "Pay instantly with credit or debit card via Stripe";
}

export function paymentMethodSummary(paymentType?: string | null): string {
  if (!isStripeCheckoutVisibleClient()) {
    return "Arrange purchase in chat";
  }
  return isContactPayment(paymentType)
    ? "Contact seller to pay"
    : "Card checkout (Stripe)";
}

/** Which buyer checkout UI to open for the listing's current paymentType. */
export function purchaseCheckoutAction(
  paymentType?: string | null
): "arrange" | "stripe" | "message" {
  if (!isStripeCheckoutVisibleClient()) return "message";
  return isContactPayment(paymentType) ? "arrange" : "stripe";
}
