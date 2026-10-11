import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRefundDisplay, refundAmountFromOrderMessage, threadRefundCardAmount } from "./refund-display";

const refundMsg = {
  type: "order",
  orderStatus: "refunded",
  listingPrice: "150",
  text: 'Payment refunded for "Bike" — $151.00.',
};

describe("thread refund card amount (prod: card $150.00 vs preview $151.00)", () => {
  it("old behaviour reproduced: purchase unreadable -> card fell back to listingPrice (no $1 fee)", () => {
    const old = getRefundDisplay({ refundAmount: undefined, total: Number(refundMsg.listingPrice) });
    expect(old.amountLabel).toBe("$150.00");
  });

  it("purchase unreadable: uses the amount carried by the refund message, matching the preview", () => {
    const props = threadRefundCardAmount(null, refundMsg);
    expect(getRefundDisplay(props).amountLabel).toBe("$151.00");
  });

  it("new messages carry refundAmount; purchase.refundAmount (Stripe) wins over everything", () => {
    expect(threadRefundCardAmount(null, { ...refundMsg, refundAmount: 151 }).refundAmount).toBe(151);
    expect(threadRefundCardAmount({ refundAmount: 151, total: 151 }, { text: "" }).refundAmount).toBe(151);
    expect(threadRefundCardAmount({ refundAmount: 120, total: 151 }, refundMsg).refundAmount).toBe(120); // partial
  });

  it("falls back to purchase.total, never to listingPrice", () => {
    expect(threadRefundCardAmount({ total: 151 }, { text: "Order paid" })).toEqual({ refundAmount: null, total: 151 });
    expect(getRefundDisplay(threadRefundCardAmount(null, { text: "Order paid", listingPrice: "150" } as never)).amountLabel).toBe("—");
  });

  it("parses partial-refund and thousands formats, rejects junk", () => {
    expect(refundAmountFromOrderMessage({ text: "Partial refund issued — $1,250.50" })).toBe(1250.5);
    expect(refundAmountFromOrderMessage({ text: 'Payment refunded for "A — $5 thing" — $6.00.' })).toBe(6);
    expect(refundAmountFromOrderMessage({ text: "hello $5" })).toBeNull();
    expect(refundAmountFromOrderMessage({ refundAmount: 0, text: "" })).toBeNull();
    expect(refundAmountFromOrderMessage(null)).toBeNull();
  });

  it("wiring: messages refund card uses the helper; webhook stores refundAmount on refund messages", () => {
    const page = readFileSync(join(process.cwd(), "app/messages/page.tsx"), "utf8");
    expect(page).toContain("{...threadRefundCardAmount(purchaseData, msg)}");
    expect(page).not.toContain("total={purchaseData?.total ?? Number(msg.listingPrice)}");
    const sync = readFileSync(join(process.cwd(), "app/lib/stripe-refund-sync.ts"), "utf8");
    expect((sync.match(/refundAmount: input\.refundAmount,|^\s+refundAmount,$/gm) || []).length).toBeGreaterThanOrEqual(2);
  });
});
