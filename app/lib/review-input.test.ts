import { describe, expect, it } from "vitest";
import { REVIEW_COMMENT_MAX } from "./order-reviews";
import { parseReviewInput, parseReviewRating } from "./review-input";

describe("parseReviewRating", () => {
  it("accepts whole stars 1..5 (and single-digit strings)", () => {
    for (const r of [1, 2, 3, 4, 5]) expect(parseReviewRating(r)).toBe(r);
    expect(parseReviewRating("4")).toBe(4);
    expect(parseReviewRating(" 5 ")).toBe(5);
  });
  it("rejects non-integers, out of range and coercible junk", () => {
    for (const r of [0, 6, -1, 4.5, 1.0000001, NaN, Infinity, "4.5", "05", "", "five", true, false, null, undefined, [5], { valueOf: () => 5 }, 1e308]) {
      expect(parseReviewRating(r)).toBeNull();
    }
  });
});

describe("parseReviewInput", () => {
  it("returns trimmed text at the cap", () => {
    const r = parseReviewInput({ rating: 5, reviewText: `  ${"a".repeat(REVIEW_COMMENT_MAX)}  ` });
    expect(r).toEqual({ ok: true, rating: 5, reviewText: "a".repeat(REVIEW_COMMENT_MAX) });
  });
  it("text is optional", () => {
    expect(parseReviewInput({ rating: 3 })).toEqual({ ok: true, rating: 3, reviewText: "" });
    expect(parseReviewInput({ rating: 3, reviewText: null })).toEqual({ ok: true, rating: 3, reviewText: "" });
  });
  it("rejects text over the cap, non-string text and a huge blob cheaply", () => {
    expect(parseReviewInput({ rating: 5, reviewText: "a".repeat(REVIEW_COMMENT_MAX + 1) }).ok).toBe(false);
    expect(parseReviewInput({ rating: 5, reviewText: ["x"] }).ok).toBe(false);
    expect(parseReviewInput({ rating: 5, reviewText: { x: 1 } }).ok).toBe(false);
    const t0 = performance.now();
    expect(parseReviewInput({ rating: 5, reviewText: " ".repeat(5_000_000) + "x" }).ok).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it("rejects a bad rating before looking at text", () => {
    expect(parseReviewInput({ rating: 4.5, reviewText: "ok" })).toEqual({
      ok: false,
      error: "Rating must be a whole number from 1 to 5",
    });
    expect(parseReviewInput(null).ok).toBe(false);
  });
});
