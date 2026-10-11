import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isReviewReceivedBySeller } from "./review-role";

const SELLER = "seller@example.com";
const BUYER = "buyer@example.com";

/** Shapes exactly as /api/submit-review writes them (legacy sellerEmail/buyerEmail on both directions). */
const buyerReviewsSeller = { role: "buyer", rating: 5, sellerEmail: SELLER, buyerEmail: BUYER, revieweeEmail: SELLER, reviewerEmail: BUYER };
const sellerReviewsBuyer = { role: "seller", rating: 1, sellerEmail: SELLER, buyerEmail: BUYER, revieweeEmail: BUYER, reviewerEmail: SELLER };
const legacyBuyerReview = { rating: 4, sellerEmail: SELLER, buyerEmail: BUYER };

describe("isReviewReceivedBySeller", () => {
  it("keeps buyer->seller reviews and legacy docs", () => {
    expect(isReviewReceivedBySeller(buyerReviewsSeller, SELLER)).toBe(true);
    expect(isReviewReceivedBySeller(legacyBuyerReview, SELLER)).toBe(true);
    expect(isReviewReceivedBySeller(buyerReviewsSeller, "SELLER@example.com")).toBe(true);
  });

  it("drops reviews the seller wrote about a buyer (same sellerEmail)", () => {
    expect(isReviewReceivedBySeller(sellerReviewsBuyer, SELLER)).toBe(false);
    expect(isReviewReceivedBySeller({ ...sellerReviewsBuyer, role: undefined }, SELLER)).toBe(false); // reviewee mismatch
    expect(isReviewReceivedBySeller(null, SELLER)).toBe(false);
  });

  it("falls back to the doc's own sellerEmail when no seller is passed", () => {
    expect(isReviewReceivedBySeller(buyerReviewsSeller)).toBe(true);
    expect(isReviewReceivedBySeller(sellerReviewsBuyer)).toBe(false);
  });
});

const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  limit: () => ({}),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  query: (_c: unknown, w: { field: string; value: unknown }) => w,
  getDocs: async (w: { field: string; value: unknown }) => ({
    docs: docs.filter((d) => d.data()[w.field] === w.value),
  }),
}));

describe("loadReviewsForUser (profile + seller page reviews list)", () => {
  beforeEach(() => {
    docs.length = 0;
  });

  it("does not show reviews the user wrote as seller as reviews they received", async () => {
    const { loadReviewsForUser, averageFromReviews } = await import("./load-profile-reviews");
    docs.push(
      { id: "r1", data: () => ({ ...buyerReviewsSeller, revieweeId: "seller-uid" }) },
      { id: "r2", data: () => ({ ...sellerReviewsBuyer, revieweeId: "buyer-uid" }) },
      { id: "r3", data: () => legacyBuyerReview }
    );
    const sellerReviews = await loadReviewsForUser("seller-uid", SELLER);
    expect(sellerReviews.map((r) => r.id).sort()).toEqual(["r1", "r3"]);
    expect(averageFromReviews(sellerReviews)).toBe(4.5); // was (5+1+4)/3 = 3.33 before

    // the buyer still sees the seller's review of them (revieweeId branch)
    const buyerReviews = await loadReviewsForUser("buyer-uid", BUYER);
    expect(buyerReviews.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("every sellerEmail-keyed review aggregate applies the role filter", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it.each([
    "app/lib/useSellerListingMeta.ts",
    "app/post/listing/[id]/page.tsx",
    "app/dashboard/page.tsx",
    "app/lib/load-profile-reviews.ts",
  ])("%s", (file) => {
    const src = read(file);
    expect(src).toMatch(/where\("sellerEmail"/);
    expect(src).toContain("isReviewReceivedBySeller(");
  });
});
