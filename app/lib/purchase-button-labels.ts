import { isStripeCheckoutVisibleClient } from "./stripe-checkout-flags";
import { messageCtaLabel } from "./listing-type-config";
import { listingPrimaryCtaLabel } from "./listing-price-display";

export function isContactPayment(paymentType?: string | null): boolean {
  return paymentType === "contact" || !isStripeCheckoutVisibleClient();
}

export function primaryPurchaseLabel(opts: {
  paymentType?: string | null;
  price?: string | number | null;
  pricingType?: string | null;
  servicePricingType?: string | null;
  listingType?: string | null;
  type?: string | null;
  hasExistingRequest?: boolean;
}): string {
  const type = opts.listingType || opts.type;
  if (opts.pricingType === "quote") return "Request Quote";
  if (!isStripeCheckoutVisibleClient()) {
    if (opts.hasExistingRequest) return "Open Chat";
    return listingPrimaryCtaLabel({
      type,
      pricingType: opts.pricingType,
      servicePricingType: opts.servicePricingType,
      price: opts.price,
    });
  }
  if (opts.hasExistingRequest && isContactPayment(opts.paymentType)) return "Open Chat";
  const price =
    opts.price != null && opts.price !== "" ? `$${opts.price}` : null;
  if (isContactPayment(opts.paymentType)) {
    return price ? `Contact Seller — ${price}` : "Contact Seller";
  }
  return price ? `Buy Now — ${price}` : "Buy Now";
}

export function shortPurchaseLabel(
  paymentType?: string | null,
  listingType?: string | null
): string {
  if (listingType === "service" || listingType === "rental" || listingType === "property" || listingType === "wanted" || listingType === "job") {
    return messageCtaLabel(listingType);
  }
  if (!isStripeCheckoutVisibleClient()) return messageCtaLabel(listingType || "physical");
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
