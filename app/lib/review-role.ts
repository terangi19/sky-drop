/**
 * `reviews` docs written by /api/submit-review carry the purchase's `sellerEmail` on BOTH
 * directions (legacy field "for existing UI queries"): when the seller reviews the buyer
 * (`role: "seller"`), `sellerEmail` is the reviewer, not the reviewee. Queries keyed on
 * `where("sellerEmail", ...)` therefore also return reviews the seller WROTE about buyers.
 *
 * True when the review doc is a review RECEIVED by `sellerEmail` as the seller:
 * - `role: "seller"` docs are reviews of the buyer -> excluded;
 * - when `revieweeEmail` is present it must be the seller;
 * - legacy docs without role/reviewee (buyer reviews from before the two-way flow) are kept.
 */
export function isReviewReceivedBySeller(
  data: { role?: unknown; revieweeEmail?: unknown; sellerEmail?: unknown } | null | undefined,
  sellerEmail?: string | null
): boolean {
  if (!data) return false;
  if (data.role === "seller") return false;
  const seller = String(sellerEmail ?? data.sellerEmail ?? "").trim().toLowerCase();
  const reviewee = typeof data.revieweeEmail === "string" ? data.revieweeEmail.trim().toLowerCase() : "";
  if (reviewee && seller && reviewee !== seller) return false;
  return true;
}
