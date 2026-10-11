import { describe, expect, it } from "vitest";
import {
  isBuyerReviewDoc,
  needsLegacyBuyerReviewLookup,
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
    // `reviewed` was client-writable by either party; only server-only buyerReviewed counts.
    expect(canBuyerReview({ status: "delivered", reviewed: true })).toBe(true);
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

  it("duplicate: rejects when a legacy buyer review exists", () => {
    const result = evaluateReviewEligibility({ ...completedOrder, reviewed: true }, "buyer@example.com", {
      legacyReviewExists: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  it("seller-set reviewed=true alone does not block the buyer", () => {
    expect(evaluateReviewEligibility({ ...completedOrder, reviewed: true }, "buyer@example.com").ok).toBe(true);
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

describe("legacy buyer-review detection", () => {
  const buyer = { uid: "buyer-uid", email: "Buyer@Example.com" };
  it("matches by reviewerId, by reviewerEmail (case-insensitive), or by legacy buyerEmail", () => {
    expect(isBuyerReviewDoc({ reviewerId: "buyer-uid" }, buyer)).toBe(true);
    expect(isBuyerReviewDoc({ reviewerEmail: "buyer@example.com" }, buyer)).toBe(true);
    expect(isBuyerReviewDoc({ buyerEmail: "buyer@example.com" }, buyer)).toBe(true);
  });
  it("does not match the seller's review or another reviewer", () => {
    expect(isBuyerReviewDoc({ role: "seller", reviewerEmail: "seller@example.com", buyerEmail: "buyer@example.com" }, buyer)).toBe(false);
    expect(isBuyerReviewDoc({ reviewerEmail: "seller@example.com", buyerEmail: "buyer@example.com" }, buyer)).toBe(false);
    expect(isBuyerReviewDoc({}, buyer)).toBe(false);
  });
  it("lookup is needed only for reviewed=true without buyerReviewed", () => {
    expect(needsLegacyBuyerReviewLookup({ reviewed: true })).toBe(true);
    expect(needsLegacyBuyerReviewLookup({ reviewed: true, buyerReviewed: true })).toBe(false);
    expect(needsLegacyBuyerReviewLookup({})).toBe(false);
  });
});
