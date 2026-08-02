/** Shared order review rules and helpers. */

export const REVIEW_COMMENT_MAX = 300;

export const REVIEW_ELIGIBLE_STATUSES = new Set(["delivered", "completed", "returned"]);

export type ReviewRole = "buyer" | "seller";

export type OrderReviewPurchase = {
  status?: string;
  disputeStatus?: string;
  buyerEmail?: string;
  sellerEmail?: string;
  reviewed?: boolean;
  buyerReviewed?: boolean;
  sellerReviewed?: boolean;
};

export function isReviewEligibleStatus(status?: string): boolean {
  return REVIEW_ELIGIBLE_STATUSES.has(String(status || "").toLowerCase());
}

export function buyerAlreadyReviewed(p: OrderReviewPurchase): boolean {
  return Boolean(p.buyerReviewed || p.reviewed);
}

export function sellerAlreadyReviewed(p: OrderReviewPurchase): boolean {
  return Boolean(p.sellerReviewed);
}

const ACTIVE_DISPUTE_STATUSES = new Set(["open", "pending", "under_review"]);

export function hasActiveDispute(disputeStatus?: string): boolean {
  return ACTIVE_DISPUTE_STATUSES.has(String(disputeStatus || "").toLowerCase());
}

export function canBuyerReview(p: OrderReviewPurchase): boolean {
  if (!isReviewEligibleStatus(p.status)) return false;
  if (["cancelled", "refunded"].includes(String(p.status || "").toLowerCase())) return false;
  if (hasActiveDispute(p.disputeStatus)) return false;
  return !buyerAlreadyReviewed(p);
}

export function canSellerReview(p: OrderReviewPurchase): boolean {
  if (!isReviewEligibleStatus(p.status)) return false;
  if (["cancelled", "refunded"].includes(String(p.status || "").toLowerCase())) return false;
  if (hasActiveDispute(p.disputeStatus)) return false;
  return !sellerAlreadyReviewed(p);
}

export function reviewDocId(purchaseId: string, reviewerId: string): string {
  return `${purchaseId}_${reviewerId}`;
}
