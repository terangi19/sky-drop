import { describe, expect, it } from "vitest";
import {
  isActiveDisputeStatus,
  isOrderCompleted,
  isStripeListingCheckout,
  orderCompletedPatch,
  orderReopenedAfterRefundPatch,
} from "./payment-order-completion";

describe("payment-order-completion", () => {
  it("treats orderCompleted and legacy fundsReleased as complete", () => {
    expect(isOrderCompleted({ orderCompleted: true })).toBe(true);
    expect(isOrderCompleted({ fundsReleased: true })).toBe(true);
    expect(isOrderCompleted({ status: "completed" })).toBe(true);
    expect(isOrderCompleted({ status: "delivered", fundsReleased: false })).toBe(false);
  });

  it("builds completion patches without fund-release wording fields only", () => {
    const patch = orderCompletedPatch({ autoCompleted: true });
    expect(patch.orderCompleted).toBe(true);
    expect(patch.status).toBe("completed");
    expect(patch.autoCompleted).toBe(true);
    expect(patch.fundsReleased).toBeUndefined();
  });

  it("refund reopen clears completion only", () => {
    const patch = orderReopenedAfterRefundPatch();
    expect(patch.orderCompleted).toBe(false);
    expect(patch.destinationCharge).toBeUndefined();
  });

  it("identifies Stripe listing checkout vs Arrange", () => {
    expect(isStripeListingCheckout({ paymentType: "contact" })).toBe(false);
    expect(isStripeListingCheckout({ destinationCharge: true })).toBe(true);
    expect(isStripeListingCheckout({ stripePaymentIntentId: "pi_x" })).toBe(true);
  });

  it("detects active disputes", () => {
    expect(isActiveDisputeStatus("open")).toBe(true);
    expect(isActiveDisputeStatus("resolved_seller")).toBe(false);
  });
});
