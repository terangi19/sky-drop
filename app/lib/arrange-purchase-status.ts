/** Purchase statuses that count as a completed sale (stock consumed). */
export const ARRANGE_SALE_COUNT_STATUSES = new Set([
  "pending",
  "seller_confirming",
  "shipped",
  "delivered",
  "completed",
  "in_progress",
  "rented",
  "returned",
  "awaiting_payment",
]);

export function countsAsBuyerPurchase(status: string, paymentType?: string): boolean {
  const s = status.toLowerCase();
  if (!s || s === "cancelled" || s === "failed" || s === "refunded") return false;
  if (s === "arrange_requested") return false;
  if (s === "pending" && paymentType === "contact") return true;
  return ARRANGE_SALE_COUNT_STATUSES.has(s);
}

/** Completed sale for seller stats (Arrange after confirm, Stripe after pay, etc.). */
export function countsAsSellerSale(
  status: string,
  paymentType?: string
): boolean {
  return countsAsBuyerPurchase(status, paymentType);
}

export function countSellerSales(
  purchases: Array<{ status?: string; paymentType?: string }>
): number {
  return purchases.filter((p) =>
    countsAsSellerSale(String(p.status || ""), String(p.paymentType || ""))
  ).length;
}

export function isArrangeRequestPending(status: string): boolean {
  return status.toLowerCase() === "arrange_requested";
}

export function canSellerConfirmArrangeSale(status: string, paymentType?: string): boolean {
  const s = status.toLowerCase();
  if (paymentType !== "contact") return false;
  return s === "arrange_requested" || s === "pending";
}
