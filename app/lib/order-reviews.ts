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

/** Party match — email must equal buyer or seller on the purchase. */
export function resolveReviewRole(
  purchase: OrderReviewPurchase,
  userEmail: string
): ReviewRole | null {
  const email = String(userEmail || "").trim().toLowerCase();
  if (!email) return null;
  const buyerEmail = String(purchase.buyerEmail || "").trim().toLowerCase();
  const sellerEmail = String(purchase.sellerEmail || "").trim().toLowerCase();
  if (email === buyerEmail) return "buyer";
  if (email === sellerEmail) return "seller";
  return null;
}

export function resolveRevieweeEmail(
  purchase: OrderReviewPurchase,
  role: ReviewRole
): string {
  return role === "buyer"
    ? String(purchase.sellerEmail || "").trim()
    : String(purchase.buyerEmail || "").trim();
}

export type ReviewEligibilityResult =
  | { ok: true; role: ReviewRole; revieweeEmail: string }
  | { ok: false; status: 400 | 403 | 409; error: string };

/**
 * Pure eligibility gate used by /api/submit-review.
 * Does not weaken integrity: party match, completed transaction statuses,
 * no self-review, one review per role, active disputes blocked.
 * Arrange Purchase and Stripe Checkout use the same completed-order model.
 */
export function evaluateReviewEligibility(
  purchase: OrderReviewPurchase,
  reviewerEmail: string,
  options?: { reviewDocExists?: boolean }
): ReviewEligibilityResult {
  const role = resolveReviewRole(purchase, reviewerEmail);
  if (!role) {
    return { ok: false, status: 403, error: "You are not part of this order" };
  }

  const status = String(purchase.status || "").toLowerCase();
  if (["cancelled", "refunded"].includes(status)) {
    return { ok: false, status: 400, error: "Reviews are not available for this order" };
  }
  if (!isReviewEligibleStatus(status)) {
    return { ok: false, status: 400, error: "You can review after the order is completed" };
  }
  if (hasActiveDispute(purchase.disputeStatus)) {
    return { ok: false, status: 400, error: "Reviews are not available while a dispute is open" };
  }

  if (role === "buyer" && buyerAlreadyReviewed(purchase)) {
    return { ok: false, status: 409, error: "You already reviewed this order" };
  }
  if (role === "seller" && sellerAlreadyReviewed(purchase)) {
    return { ok: false, status: 409, error: "You already reviewed this order" };
  }
  if (options?.reviewDocExists) {
    return { ok: false, status: 409, error: "You already reviewed this order" };
  }

  const revieweeEmail = resolveRevieweeEmail(purchase, role);
  const reviewerNorm = String(reviewerEmail || "").trim().toLowerCase();
  if (!revieweeEmail || revieweeEmail.toLowerCase() === reviewerNorm) {
    return { ok: false, status: 400, error: "Invalid review target for this order" };
  }

  return { ok: true, role, revieweeEmail };
}
