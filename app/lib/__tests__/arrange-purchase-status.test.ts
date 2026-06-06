import { describe, it, expect } from "vitest";
import {
  ARRANGE_SALE_COUNT_STATUSES,
  countsAsBuyerPurchase,
  countsAsSellerSale,
  countSellerSales,
  isArrangeRequestPending,
  canSellerConfirmArrangeSale,
} from "../arrange-purchase-status";

describe("countsAsBuyerPurchase", () => {
  it("returns false for empty status", () => {
    expect(countsAsBuyerPurchase("")).toBe(false);
  });

  it("returns false for cancelled", () => {
    expect(countsAsBuyerPurchase("cancelled")).toBe(false);
  });

  it("returns false for failed", () => {
    expect(countsAsBuyerPurchase("failed")).toBe(false);
  });

  it("returns false for arrange_requested", () => {
    expect(countsAsBuyerPurchase("arrange_requested")).toBe(false);
  });

  it('returns true for "pending" with contact payment type', () => {
    expect(countsAsBuyerPurchase("pending", "contact")).toBe(true);
  });

  it("returns true for statuses in ARRANGE_SALE_COUNT_STATUSES", () => {
    for (const status of ARRANGE_SALE_COUNT_STATUSES) {
      expect(countsAsBuyerPurchase(status)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(countsAsBuyerPurchase("COMPLETED")).toBe(true);
    expect(countsAsBuyerPurchase("Shipped")).toBe(true);
  });
});

describe("countsAsSellerSale", () => {
  it("delegates to countsAsBuyerPurchase", () => {
    expect(countsAsSellerSale("completed")).toBe(true);
    expect(countsAsSellerSale("cancelled")).toBe(false);
  });
});

describe("countSellerSales", () => {
  it("returns 0 for empty array", () => {
    expect(countSellerSales([])).toBe(0);
  });

  it("counts valid sales", () => {
    const purchases = [
      { status: "completed", paymentType: "stripe" },
      { status: "cancelled", paymentType: "stripe" },
      { status: "shipped", paymentType: "contact" },
    ];
    expect(countSellerSales(purchases)).toBe(2);
  });

  it("handles missing fields", () => {
    const purchases = [{ status: undefined }, {}];
    expect(countSellerSales(purchases)).toBe(0);
  });
});

describe("isArrangeRequestPending", () => {
  it("returns true for arrange_requested", () => {
    expect(isArrangeRequestPending("arrange_requested")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isArrangeRequestPending("ARRANGE_REQUESTED")).toBe(true);
  });

  it("returns false for other statuses", () => {
    expect(isArrangeRequestPending("pending")).toBe(false);
    expect(isArrangeRequestPending("completed")).toBe(false);
  });
});

describe("canSellerConfirmArrangeSale", () => {
  it("returns false for non-contact payment type", () => {
    expect(canSellerConfirmArrangeSale("arrange_requested", "stripe")).toBe(false);
  });

  it("returns true for arrange_requested with contact", () => {
    expect(canSellerConfirmArrangeSale("arrange_requested", "contact")).toBe(true);
  });

  it("returns true for pending with contact", () => {
    expect(canSellerConfirmArrangeSale("pending", "contact")).toBe(true);
  });

  it("returns false for completed with contact", () => {
    expect(canSellerConfirmArrangeSale("completed", "contact")).toBe(false);
  });

  it("returns false when payment type undefined", () => {
    expect(canSellerConfirmArrangeSale("pending")).toBe(false);
  });
});
