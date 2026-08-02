import { describe, expect, it } from "vitest";
import {
  canBuyerReview,
  canSellerReview,
  REVIEW_COMMENT_MAX,
  reviewDocId,
  evaluateReviewEligibility,
  resolveReviewRole,
} from "./order-reviews";

const completedOrder = {
  status: "completed",
  buyerEmail: "buyer@example.com",
  sellerEmail: "seller@example.com",
};

describe("order-reviews", () => {
  it("allows buyer review after delivery", () => {
    expect(canBuyerReview({ status: "delivered" })).toBe(true);
    expect(canBuyerReview({ status: "completed" })).toBe(true);
  });

  it("blocks reviews on refunded or active disputed orders", () => {
    expect(canBuyerReview({ status: "refunded" })).toBe(false);
    expect(canSellerReview({ status: "delivered", disputeStatus: "open" })).toBe(false);
    expect(canBuyerReview({ status: "delivered", disputeStatus: "resolved_seller" })).toBe(true);
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

describe("evaluateReviewEligibility — integrity cases", () => {
  it("eligible: buyer on completed Arrange Purchase / contact order", () => {
    const result = evaluateReviewEligibility(completedOrder, "buyer@example.com");
    expect(result).toEqual({
      ok: true,
      role: "buyer",
      revieweeEmail: "seller@example.com",
    });
  });

  it("eligible: seller on delivered order", () => {
    const result = evaluateReviewEligibility(
      { ...completedOrder, status: "delivered" },
      "seller@example.com"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("seller");
      expect(result.revieweeEmail).toBe("buyer@example.com");
    }
  });

  it("unrelated: rejects non-party reviewer", () => {
    const result = evaluateReviewEligibility(completedOrder, "stranger@example.com");
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "You are not part of this order",
    });
  });

  it("self: rejects when buyer and seller emails match", () => {
    const result = evaluateReviewEligibility(
      {
        status: "completed",
        buyerEmail: "same@example.com",
        sellerEmail: "same@example.com",
      },
      "same@example.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid review target for this order",
    });
  });

  it("duplicate: rejects second buyer review", () => {
    const result = evaluateReviewEligibility(
      { ...completedOrder, buyerReviewed: true },
      "buyer@example.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "You already reviewed this order",
    });
  });

  it("duplicate: rejects when review doc already exists", () => {
    const result = evaluateReviewEligibility(completedOrder, "buyer@example.com", {
      reviewDocExists: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("unauthorized party match fails for empty email", () => {
    expect(resolveReviewRole(completedOrder, "")).toBeNull();
    const result = evaluateReviewEligibility(completedOrder, "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("rejects early statuses before completion", () => {
    for (const status of ["pending", "seller_confirming", "shipped", "paid"]) {
      const result = evaluateReviewEligibility(
        { ...completedOrder, status },
        "buyer@example.com"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/completed/i);
      }
    }
  });

  it("rejects refunded and cancelled", () => {
    expect(evaluateReviewEligibility({ ...completedOrder, status: "refunded" }, "buyer@example.com").ok).toBe(false);
    expect(evaluateReviewEligibility({ ...completedOrder, status: "cancelled" }, "buyer@example.com").ok).toBe(false);
  });

  it("rejects active disputes", () => {
    const result = evaluateReviewEligibility(
      { ...completedOrder, disputeStatus: "under_review" },
      "buyer@example.com"
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Reviews are not available while a dispute is open",
    });
  });
});
