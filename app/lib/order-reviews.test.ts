import { describe, expect, it } from "vitest";
import {
  canBuyerReview,
  canSellerReview,
  REVIEW_COMMENT_MAX,
  reviewDocId,
} from "./order-reviews";

describe("order-reviews", () => {
  it("allows buyer review after delivery", () => {
    expect(canBuyerReview({ status: "delivered" })).toBe(true);
    expect(canBuyerReview({ status: "completed" })).toBe(true);
  });

  it("blocks reviews on refunded or disputed orders", () => {
    expect(canBuyerReview({ status: "refunded" })).toBe(false);
    expect(canSellerReview({ status: "delivered", disputeStatus: "open" })).toBe(false);
  });

  it("allows one review per role", () => {
    expect(canBuyerReview({ status: "delivered", buyerReviewed: true })).toBe(false);
    expect(canBuyerReview({ status: "delivered", reviewed: true })).toBe(false);
    expect(canSellerReview({ status: "delivered", sellerReviewed: true })).toBe(false);
  });

  it("seller can review after buyer confirms", () => {
    expect(canSellerReview({ status: "delivered" })).toBe(true);
    expect(canSellerReview({ status: "preparing" })).toBe(false);
  });

  it("uses stable review doc ids", () => {
    expect(reviewDocId("purchase1", "uid_abc")).toBe("purchase1_uid_abc");
    expect(REVIEW_COMMENT_MAX).toBe(300);
  });
});
