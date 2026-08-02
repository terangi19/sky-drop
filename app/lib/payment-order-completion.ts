/**
 * Order completion tracking for Stripe Checkout destination charges.
 *
 * Money moves to the seller at PaymentIntent success (transfer_data.destination).
 * These fields only track whether the *order* is administratively complete —
 * they do not move, hold, or release Stripe funds.
 */

export type OrderCompletionPurchase = {
  orderCompleted?: boolean;
  orderCompletedAt?: unknown;
  /** @deprecated Legacy alias — read via isOrderCompleted(); do not use for new writes. */
  fundsReleased?: boolean;
  fundsReleasedAt?: unknown;
  autoCompleted?: boolean;
  /** @deprecated Legacy alias for autoCompleted */
  autoReleased?: boolean;
  status?: string;
  stripePaymentIntentId?: string;
  destinationCharge?: boolean;
  paymentType?: string;
  stripeTransferId?: string;
};

/** True when the purchase order is marked complete (legacy fundsReleased still honored). */
export function isOrderCompleted(p: OrderCompletionPurchase | null | undefined): boolean {
  if (!p) return false;
  if (p.orderCompleted === true) return true;
  if (p.fundsReleased === true) return true;
  return String(p.status || "").toLowerCase() === "completed";
}

/** Patch to mark an order complete without implying a fund transfer. */
export function orderCompletedPatch(opts?: {
  autoCompleted?: boolean;
  at?: Date;
}): Record<string, unknown> {
  const at = opts?.at || new Date();
  const patch: Record<string, unknown> = {
    orderCompleted: true,
    orderCompletedAt: at,
    status: "completed",
  };
  if (opts?.autoCompleted) {
    patch.autoCompleted = true;
  }
  return patch;
}

/** Patch when a full refund reverses completion. */
export function orderReopenedAfterRefundPatch(): Record<string, unknown> {
  return {
    orderCompleted: false,
    // Keep destinationCharge history intact — refunds do not change charge model.
  };
}

/**
 * Listing Stripe Checkout must be destination charges only.
 * Arrange Purchase has no Stripe PI.
 */
export function isStripeListingCheckout(p: OrderCompletionPurchase | null | undefined): boolean {
  if (!p) return false;
  if (String(p.paymentType || "").toLowerCase() === "contact") return false;
  return Boolean(p.stripePaymentIntentId) || p.destinationCharge === true;
}

/** Active dispute statuses that freeze fulfillment (not refund eligibility). */
export function isActiveDisputeStatus(disputeStatus?: string): boolean {
  return ["open", "pending", "under_review"].includes(String(disputeStatus || "").toLowerCase());
}
