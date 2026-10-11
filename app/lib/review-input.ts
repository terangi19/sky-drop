/**
 * Input validation for /api/submit-review (the only writer of `reviews`; firestore.rules deny client
 * create/update/delete). Ratings are whole stars 1..5: the UI (InteractiveReviewStars) only emits
 * integers, and aggregates (#117 recompute, seller-rating-summary) assume whole-star inputs.
 */
import { REVIEW_COMMENT_MAX } from "./order-reviews";

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

export type ReviewInputResult =
  | { ok: true; rating: number; reviewText: string }
  | { ok: false; error: string };

/** Integer 1..5. Numbers only, plus a single-digit string ("4") for old clients; never booleans/arrays. */
export function parseReviewRating(raw: unknown): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && /^[1-5]$/.test(raw.trim())) n = Number(raw.trim());
  else return null;
  if (!Number.isInteger(n) || n < REVIEW_RATING_MIN || n > REVIEW_RATING_MAX) return null;
  return n;
}

export function parseReviewInput(body: Record<string, unknown> | null | undefined): ReviewInputResult {
  const rating = parseReviewRating(body?.rating);
  if (rating === null) {
    return { ok: false, error: "Rating must be a whole number from 1 to 5" };
  }
  const rawText = body?.reviewText;
  if (rawText !== undefined && rawText !== null && typeof rawText !== "string") {
    return { ok: false, error: "Comment must be text" };
  }
  // Cheap pre-trim guard so a multi-MB string is rejected without further work.
  if (typeof rawText === "string" && rawText.length > REVIEW_COMMENT_MAX * 4) {
    return { ok: false, error: `Comment must be ${REVIEW_COMMENT_MAX} characters or fewer` };
  }
  const reviewText = typeof rawText === "string" ? rawText.trim() : "";
  if (reviewText.length > REVIEW_COMMENT_MAX) {
    return { ok: false, error: `Comment must be ${REVIEW_COMMENT_MAX} characters or fewer` };
  }
  return { ok: true, rating, reviewText };
}
