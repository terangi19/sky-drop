export function isContactPayment(paymentType?: string | null): boolean {
  return paymentType === "contact";
}

export function primaryPurchaseLabel(opts: {
  paymentType?: string | null;
  price?: string | number | null;
  pricingType?: string | null;
  hasExistingRequest?: boolean;
}): string {
  if (opts.pricingType === "quote") return "Request Quote";
  if (opts.hasExistingRequest) return "Open Chat";
  const price =
    opts.price != null && opts.price !== "" ? `$${opts.price}` : null;
  if (isContactPayment(opts.paymentType)) {
    return price ? `Contact Seller — ${price}` : "Contact Seller";
  }
  return price ? `Buy Now — ${price}` : "Buy Now";
}

export function shortPurchaseLabel(paymentType?: string | null): string {
  return isContactPayment(paymentType) ? "Contact Seller" : "Buy Now";
}

export function purchaseButtonTitle(paymentType?: string | null): string {
  return isContactPayment(paymentType)
    ? "Message the seller to arrange bank transfer, cash, or pickup"
    : "Pay instantly with credit or debit card via Stripe";
}

export function paymentMethodSummary(paymentType?: string | null): string {
  return isContactPayment(paymentType)
    ? "Contact seller to pay"
    : "Card checkout (Stripe)";
}
