import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NO_REVIEWS_LABEL, sellerRatingSummary } from "./seller-rating-summary";
import { PUBLIC_PROFILE_FIELDS } from "./public-profile-fields";

describe("sellerRatingSummary (listing page trust summary)", () => {
  it("uses the server aggregates averageRating + reviewCount", () => {
    expect(sellerRatingSummary({ averageRating: 3.4, reviewCount: 7 })).toEqual({
      kind: "rated",
      average: 3.4,
      count: 7,
      label: "★ 3.4 (7 reviews)",
    });
    expect(sellerRatingSummary({ averageRating: 4, reviewCount: 1 }).label).toBe("★ 4.0 (1 review)");
  });

  it("never invents a 5.0: count without an average is 'No reviews yet' (old bug fell back to 5.0)", () => {
    expect(sellerRatingSummary({ reviewCount: 3 })).toEqual({ kind: "none", label: NO_REVIEWS_LABEL });
    // the old, never-written field is ignored
    expect(sellerRatingSummary({ reviewAverage: 2.1, reviewCount: 3 } as never).kind).toBe("none");
  });

  it("shows 'No reviews yet' for a seller with no reviews", () => {
    expect(sellerRatingSummary({}).label).toBe(NO_REVIEWS_LABEL);
    expect(sellerRatingSummary({ averageRating: 0, reviewCount: 0 }).label).toBe(NO_REVIEWS_LABEL);
    expect(sellerRatingSummary(null).label).toBe(NO_REVIEWS_LABEL);
  });

  it("falls back to client review stats when the profile has no aggregates (legacy reviews)", () => {
    expect(sellerRatingSummary({}, { avg: 4.25, count: 2 }).label).toBe("★ 4.3 (2 reviews)");
    // profile aggregates win over the client sample
    expect(sellerRatingSummary({ averageRating: 2, reviewCount: 9 }, { avg: 5, count: 1 }).label).toBe(
      "★ 2.0 (9 reviews)"
    );
  });

  it("ignores junk values and clamps to 1..5", () => {
    expect(sellerRatingSummary({ averageRating: "4.5", reviewCount: "3" } as never).kind).toBe("none");
    expect(sellerRatingSummary({ averageRating: NaN, reviewCount: 2 }).kind).toBe("none");
    expect(sellerRatingSummary({ averageRating: 7, reviewCount: 2 }).label).toBe("★ 5.0 (2 reviews)");
  });

  it("the fields it reads are exposed by the public profile API; reviewAverage is not", () => {
    const fields = PUBLIC_PROFILE_FIELDS as readonly string[];
    expect(fields).toContain("averageRating");
    expect(fields).toContain("reviewCount");
    expect(fields).not.toContain("reviewAverage");
  });

  it("the listing page no longer reads reviewAverage or hard-codes 5.0", () => {
    const src = readFileSync(join(process.cwd(), "app/post/listing/[id]/page.tsx"), "utf8");
    expect(src).not.toContain("reviewAverage");
    expect(src).not.toMatch(/:\s*"5\.0"/);
    expect(src).toContain("sellerRatingSummary(sellerProfile, sellerReviewData)");
  });
});
