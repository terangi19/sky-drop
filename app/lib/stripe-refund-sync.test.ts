import { describe, expect, it, vi } from "vitest";
import {
  applyStripeRefundToPurchase,
  findPurchaseForStripeRefund,
  isFullStripeRefund,
  resolveStripeRefundContext,
} from "./stripe-refund-sync";

describe("isFullStripeRefund", () => {
  it("returns true when Stripe marks charge as fully refunded", () => {
    expect(isFullStripeRefund(5000, 10000, true)).toBe(true);
  });

  it("returns true when refunded amount equals charge amount", () => {
    expect(isFullStripeRefund(10100, 10100, false)).toBe(true);
  });

  it("returns false for partial refunds", () => {
    expect(isFullStripeRefund(5000, 10100, false)).toBe(false);
  });
});

describe("findPurchaseForStripeRefund", () => {
  it("finds purchase by stripePaymentIntentId field", async () => {
    const purchaseData = {
      stripePaymentIntentId: "pi_test_123",
      status: "seller_confirming",
      buyerEmail: "buyer@test.com",
      sellerEmail: "seller@test.com",
    };
    const db = {
      collection: vi.fn((name: string) => {
        if (name !== "purchases") throw new Error(`unexpected collection ${name}`);
        return {
          doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
          where: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn(async () => ({
                empty: false,
                docs: [{ id: "pi_pi_test_123", data: () => purchaseData, ref: { update: vi.fn() } }],
              })),
            })),
          })),
        };
      }),
    } as any;

    const found = await findPurchaseForStripeRefund(db, "pi_test_123");
    expect(found?.id).toBe("pi_pi_test_123");
    expect(found?.data.status).toBe("seller_confirming");
  });
});

describe("applyStripeRefundToPurchase", () => {
  it("marks purchase refunded and restores single-quantity listing", async () => {
    const purchaseUpdate = vi.fn();
    const listingUpdate = vi.fn();
    const purchaseData = {
      stripePaymentIntentId: "pi_test_456",
      status: "seller_confirming",
      destinationCharge: true,
      fundsReleased: true,
      buyerEmail: "buyer@test.com",
      sellerEmail: "seller@test.com",
      listingId: "listing_1",
      listingTitle: "Test Item",
      conversationId: "conv_1",
      orderId: "order_1",
      total: 25,
    };

    const db = {
      collection: vi.fn((name: string) => {
        if (name === "purchases") {
          return {
            doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  empty: false,
                  docs: [
                    {
                      id: "purchase_1",
                      data: () => purchaseData,
                      ref: { update: purchaseUpdate },
                    },
                  ],
                })),
              })),
            })),
            add: vi.fn(),
          };
        }
        if (name === "listings") {
          return {
            doc: vi.fn(() => ({
              get: vi.fn(async () => ({
                exists: true,
                data: () => ({ status: "sold", soldTo: "buyer@test.com" }),
              })),
              update: listingUpdate,
            })),
          };
        }
        if (name === "orders") {
          return {
            doc: vi.fn(() => ({ set: vi.fn() })),
          };
        }
        if (name === "conversations") {
          return {
            doc: vi.fn(() => ({ set: vi.fn() })),
          };
        }
        if (name === "messages") {
          return {
            add: vi.fn(),
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                get: vi.fn(async () => ({ empty: true, docs: [] })),
              })),
              get: vi.fn(async () => ({ empty: true, docs: [] })),
            })),
          };
        }
        if (name === "disputes") {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(() => ({ get: vi.fn(async () => ({ empty: true, docs: [] })) })),
            })),
          };
        }
        throw new Error(`unexpected collection ${name}`);
      }),
      batch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
    } as any;

    const result = await applyStripeRefundToPurchase(
      {
        paymentIntentId: "pi_test_456",
        refundAmount: 25,
        refundId: "re_test_1",
        fullyRefunded: true,
      },
      db
    );

    expect(result.updated).toBe(true);
    expect(result.purchaseId).toBe("purchase_1");
    expect(purchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "refunded",
        orderCompleted: false,
        refundAmount: 25,
      })
    );
    expect(listingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "live" })
    );
  });
});

describe("resolveStripeRefundContext", () => {
  it("uses cumulative charge refunds for dashboard full refunds", async () => {
    const stripe = {
      charges: {
        retrieve: vi.fn(async () => ({
          payment_intent: "pi_full_refund",
          amount: 2500,
          amount_refunded: 2500,
          refunded: true,
        })),
      },
      paymentIntents: { retrieve: vi.fn() },
    };

    const resolved = await resolveStripeRefundContext(stripe as any, {
      chargeId: "ch_test",
      refundAmountCents: 2500,
    });

    expect(resolved.paymentIntentId).toBe("pi_full_refund");
    expect(resolved.fullyRefunded).toBe(true);
    expect(resolved.refundAmountCents).toBe(2500);
  });
});
