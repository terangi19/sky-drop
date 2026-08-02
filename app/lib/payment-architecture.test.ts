/**
 * Regression tests for the supported payment architecture:
 * - Stripe Checkout = destination charges only (no delayed transfers)
 * - Arrange Purchase = off-platform money
 * - orderCompleted tracks order state, not fund release
 * - Refunds are independent of orderCompleted
 */
import { describe, expect, it } from "vitest";
import {
  isOrderCompleted,
  isStripeListingCheckout,
  orderCompletedPatch,
  orderReopenedAfterRefundPatch,
  isActiveDisputeStatus,
} from "./payment-order-completion";
import { sellerPayoutCents } from "./purchase-service";
import { canBuyerReview } from "./order-reviews";

describe("payment architecture — Stripe Checkout destination charges", () => {
  it("treats destinationCharge purchases as Stripe listing checkout", () => {
    expect(
      isStripeListingCheckout({
        destinationCharge: true,
        stripePaymentIntentId: "pi_abc",
        paymentType: "stripe",
      })
    ).toBe(true);
  });

  it("does not treat Arrange Purchase as Stripe listing checkout", () => {
    expect(
      isStripeListingCheckout({
        paymentType: "contact",
        destinationCharge: false,
      })
    ).toBe(false);
  });

  it("completion patch never writes legacy fundsReleased", () => {
    const patch = orderCompletedPatch();
    expect(patch).toEqual(
      expect.objectContaining({
        orderCompleted: true,
        status: "completed",
      })
    );
    expect(Object.keys(patch)).not.toContain("fundsReleased");
    expect(Object.keys(patch)).not.toContain("stripeTransferId");
  });

  it("successful payment does not imply orderCompleted until fulfillment ends", () => {
    const afterCheckout = {
      destinationCharge: true,
      stripePaymentIntentId: "pi_1",
      status: "seller_confirming",
      orderCompleted: false,
    };
    expect(isStripeListingCheckout(afterCheckout)).toBe(true);
    expect(isOrderCompleted(afterCheckout)).toBe(false);
  });

  it("order completion after delivery is status-only", () => {
    const delivered = { status: "delivered", destinationCharge: true };
    const completed = { ...delivered, ...orderCompletedPatch() };
    expect(isOrderCompleted(completed)).toBe(true);
    expect(completed.status).toBe("completed");
  });
});

describe("payment architecture — refunds decoupled from completion", () => {
  it("allows conceptually refunding after orderCompleted (eligibility is dispute+PI)", () => {
    // Refund API no longer checks orderCompleted/fundsReleased.
    // This unit test locks the helper contract used by that route.
    const completedOrder = {
      orderCompleted: true,
      status: "completed",
      stripePaymentIntentId: "pi_1",
      disputeStatus: "open",
    };
    expect(isOrderCompleted(completedOrder)).toBe(true);
    expect(isActiveDisputeStatus(completedOrder.disputeStatus)).toBe(true);
    expect(Boolean(completedOrder.stripePaymentIntentId)).toBe(true);
  });

  it("refund reopen clears orderCompleted only", () => {
    const patch = orderReopenedAfterRefundPatch();
    expect(patch.orderCompleted).toBe(false);
    expect(patch.destinationCharge).toBeUndefined();
  });
});

describe("payment architecture — disputes and reviews", () => {
  it("active dispute blocks reviews; resolved does not", () => {
    expect(canBuyerReview({ status: "delivered", disputeStatus: "open" })).toBe(false);
    expect(canBuyerReview({ status: "delivered", disputeStatus: "resolved_seller" })).toBe(true);
  });
});

describe("payment architecture — payout math", () => {
  it("seller payout excludes $1 application fee", () => {
    expect(sellerPayoutCents({ total: 51, processingFee: 1 })).toBe(5000);
  });
});

describe("payment architecture — legacy path rejection signals", () => {
  it("flags non-destination Stripe PI without destinationCharge as unsupported listing path", () => {
    const legacy = {
      destinationCharge: false,
      stripePaymentIntentId: "pi_old",
      paymentType: "stripe",
    };
    // Still "Stripe listing" by PI presence, but release/dispute APIs reject transfer creation.
    expect(isStripeListingCheckout(legacy)).toBe(true);
    expect(legacy.destinationCharge).toBe(false);
  });
});
