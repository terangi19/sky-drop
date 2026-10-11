import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fnAgg from "../../functions/src/review-aggregates";

type Doc = { id: string; data: Record<string, unknown> };
const store = {
  reviews: [] as Doc[],
  profiles: new Map<string, Record<string, unknown>>(),
  txCount: 0,
};

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
}));
vi.mock("./firebase-admin", () => {
  const query = (field: string, value: unknown, max: number) => ({ kind: "query", field, value, max });
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({ kind: "doc", name, id }),
        where: (field: string, _op: string, value: unknown) => ({
          limit: (max: number) => query(field, value, max),
        }),
      }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        store.txCount++;
        const tx = {
          get: async (q: { field: string; value: unknown; max: number }) => ({
            docs: store.reviews
              .filter((d) => d.data[q.field] === q.value)
              .slice(0, q.max)
              .map((d) => ({ id: d.id, get: (k: string) => d.data[k] })),
          }),
          set: (ref: { name: string; id: string }, data: Record<string, unknown>, opts: { merge?: boolean }) => {
            expect(ref.name).toBe("profiles");
            expect(opts).toEqual({ merge: true });
            store.profiles.set(ref.id, { ...(store.profiles.get(ref.id) || {}), ...data });
          },
        };
        return fn(tx);
      },
    }),
  };
});

const SELLER = "seller-uid";
const BUYER = "buyer-uid";
const review = (id: string, revieweeId: string, rating: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  data: { revieweeId, rating, ...extra },
});

beforeEach(() => {
  store.reviews = [];
  store.profiles = new Map([[SELLER, { username: "s", averageRating: 0, reviewCount: 0 }]]);
  store.txCount = 0;
});

// Real shapes written by /api/submit-review: role = REVIEWER's role; sellerEmail = purchase seller on both directions.
const S_EMAIL = "seller@x.test";
const B_EMAIL = "buyer@x.test";
const asSeller = (id: string, rating: number) =>
  review(id, SELLER, rating, { role: "buyer", revieweeEmail: S_EMAIL, sellerEmail: S_EMAIL, buyerEmail: B_EMAIL });
// SELLER bought something from someone else and that seller reviewed them -> SELLER is the BUYER here.
const asBuyer = (id: string, rating: number) =>
  review(id, SELLER, rating, { role: "seller", revieweeEmail: S_EMAIL, sellerEmail: "other@x.test", buyerEmail: S_EMAIL });

describe("PROFILE-RATING-SELLER-ONLY: profile averageRating/reviewCount = seller rating", () => {
  it("excludes reviews the user received as a buyer (old code: 3.0 / 2 instead of 5.0 / 1)", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(asSeller("r-seller", 5), asBuyer("r-buyer", 1));
    const agg = await recomputeProfileReviewAggregates(SELLER);
    expect(agg).toEqual({ averageRating: 5, reviewCount: 1 });
    expect(store.profiles.get(SELLER)).toMatchObject({ averageRating: 5, reviewCount: 1 });
  });

  it("a user with only buyer-side reviews has no seller rating (0 / 0), keeps public field names", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(asBuyer("b1", 2), asBuyer("b2", 4));
    await recomputeProfileReviewAggregates(SELLER);
    const p = store.profiles.get(SELLER)!;
    expect(p).toMatchObject({ averageRating: 0, reviewCount: 0 });
    expect(Object.keys(p).filter((k) => /buyer/i.test(k))).toEqual([]);
  });

  it("legacy buyer->seller reviews without role/revieweeEmail still count", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(review("legacy", SELLER, 4, { sellerEmail: S_EMAIL }), asSeller("new", 5));
    expect(await recomputeProfileReviewAggregates(SELLER)).toEqual({ averageRating: 4.5, reviewCount: 2 });
  });

  it("isSellerRatingReview matches the REVIEW-STATS-REVIEWER-ROLE rule (#111 isReviewReceivedBySeller)", async () => {
    const { isSellerRatingReview } = await import("./review-aggregates");
    expect(isSellerRatingReview({ role: "buyer", revieweeEmail: "A@x", sellerEmail: "a@x" })).toBe(true);
    expect(isSellerRatingReview({ role: "seller", revieweeEmail: "b@x", sellerEmail: "a@x" })).toBe(false);
    expect(isSellerRatingReview({ role: "seller" })).toBe(false);
    expect(isSellerRatingReview({ revieweeEmail: "b@x", sellerEmail: "a@x" })).toBe(false); // reviewee is not the seller
    expect(isSellerRatingReview({ sellerEmail: "a@x" })).toBe(true); // legacy
    expect(isSellerRatingReview({})).toBe(true);
    expect(isSellerRatingReview(null)).toBe(false);
  });

  it("app and Cloud Functions copies agree on the seller filter", async () => {
    const app = await import("./review-aggregates");
    const docs = [
      { rating: 5, role: "buyer", revieweeEmail: "a@x", sellerEmail: "a@x" },
      { rating: 1, role: "seller", revieweeEmail: "a@x", sellerEmail: "b@x" },
      { rating: 3, sellerEmail: "a@x" },
      { rating: 2, revieweeEmail: "a@x", sellerEmail: "b@x" },
      null,
    ];
    expect(app.computeSellerReviewAggregates(docs)).toEqual(fnAgg.computeSellerReviewAggregates(docs));
    expect(app.computeSellerReviewAggregates(docs)).toEqual({ averageRating: 4, reviewCount: 2 });
    for (const d of docs) expect(app.isSellerRatingReview(d)).toBe(fnAgg.isSellerRatingReview(d));
  });

  it("triggers recompute when role fields change, not on comment-only edits", () => {
    const base = { rating: 4, revieweeId: "a", role: "buyer", revieweeEmail: "a@x", sellerEmail: "a@x" };
    expect(fnAgg.reviewAggregateInputsChanged(base, { ...base, comment: "x" })).toBe(false);
    expect(fnAgg.reviewAggregateInputsChanged(base, { ...base, role: "seller" })).toBe(true);
    expect(fnAgg.reviewAggregateInputsChanged(base, { ...base, revieweeEmail: "b@x" })).toBe(true);
    expect(fnAgg.reviewAggregateInputsChanged(base, { ...base, sellerEmail: "b@x" })).toBe(true);
  });

  it("Cloud Function recompute + submit-review path both use the seller filter", () => {
    const fn = readFileSync(join(process.cwd(), "functions/src/index.ts"), "utf8");
    expect(fn).toContain("computeSellerReviewAggregates(");
    expect(fn).not.toMatch(/computeReviewAggregates\(snap\.docs/);
    const lib = readFileSync(join(process.cwd(), "app/lib/review-aggregates.ts"), "utf8");
    expect(lib).toMatch(/export async function incrementProfileReviewAggregates[\s\S]*recomputeProfileReviewAggregates\(revieweeId\)/);
    const route = readFileSync(join(process.cwd(), "app/api/submit-review/route.ts"), "utf8");
    expect(route).toContain("incrementProfileReviewAggregates(revieweeId");
  });
});
