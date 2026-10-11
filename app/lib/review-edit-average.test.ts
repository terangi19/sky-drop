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

describe("computeReviewAggregates", () => {
  it("averages valid 1..5 ratings, rounds to 0.1, ignores junk", async () => {
    const { computeReviewAggregates } = await import("./review-aggregates");
    expect(computeReviewAggregates([5, 4, 4])).toEqual({ averageRating: 4.3, reviewCount: 3 });
    expect(computeReviewAggregates([])).toEqual({ averageRating: 0, reviewCount: 0 });
    // rules don't validate `rating` on a direct client update: 999 / "x" / 0 / null must not count
    expect(computeReviewAggregates([5, 999, "x", 0, null, "3"])).toEqual({ averageRating: 4, reviewCount: 2 });
  });

  it("app and Cloud Functions copies agree", async () => {
    const app = await import("./review-aggregates");
    for (const input of [[5, 4, 4], [], [1], [2.5, 5, 999, "4"], [null, undefined, -1]]) {
      expect(app.computeReviewAggregates(input)).toEqual(fnAgg.computeReviewAggregates(input));
    }
  });
});

describe("recomputeProfileReviewAggregates (server, from source, in a transaction)", () => {
  it("an edited rating is reflected (the old rolling increment kept the pre-edit average)", async () => {
    const { incrementProfileReviewAggregates, recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(review("r1", SELLER, 5));
    await incrementProfileReviewAggregates(SELLER, 5);
    store.reviews.push(review("r2", SELLER, 1));
    await incrementProfileReviewAggregates(SELLER, 1);
    expect(store.profiles.get(SELLER)).toMatchObject({ averageRating: 3, reviewCount: 2 });

    // reviewer edits r2 1 -> 5 directly (allowed by firestore.rules), trigger recomputes
    store.reviews[1].data.rating = 5;
    await recomputeProfileReviewAggregates(SELLER);
    expect(store.profiles.get(SELLER)).toMatchObject({ averageRating: 5, reviewCount: 2, username: "s" });
  });

  it("a deleted review drops out of the count", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(review("r1", SELLER, 5), review("r2", SELLER, 2));
    await recomputeProfileReviewAggregates(SELLER);
    store.reviews.splice(1, 1);
    await recomputeProfileReviewAggregates(SELLER);
    expect(store.profiles.get(SELLER)).toMatchObject({ averageRating: 5, reviewCount: 1 });
  });

  it("is keyed on revieweeId: reviews the seller WROTE about buyers (legacy sellerEmail) don't count", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(
      review("buyer->seller", SELLER, 5, { role: "buyer", sellerEmail: "s@x" }),
      review("seller->buyer", BUYER, 1, { role: "seller", sellerEmail: "s@x" })
    );
    const agg = await recomputeProfileReviewAggregates(SELLER);
    expect(agg).toEqual({ averageRating: 5, reviewCount: 1 });
  });

  it("is idempotent (a double run from the API + trigger is harmless) and no-ops without an id", async () => {
    const { recomputeProfileReviewAggregates } = await import("./review-aggregates");
    store.reviews.push(review("r1", SELLER, 4));
    await recomputeProfileReviewAggregates(SELLER);
    await recomputeProfileReviewAggregates(SELLER);
    expect(store.profiles.get(SELLER)).toMatchObject({ averageRating: 4, reviewCount: 1 });
    expect(await recomputeProfileReviewAggregates("")).toBeNull();
    expect(store.txCount).toBe(2);
  });
});

describe("Cloud Functions triggers", () => {
  const src = readFileSync(join(process.cwd(), "functions/src/index.ts"), "utf8");

  it("recompute on review update (rating/reviewee changed) and on delete", () => {
    expect(src).toMatch(/export const onReviewUpdated = onDocumentUpdated\("reviews\/\{reviewId\}"/);
    expect(src).toMatch(/export const onReviewDeleted = onDocumentDeleted\("reviews\/\{reviewId\}"/);
    expect(src).toContain("reviewAggregateInputsChanged(before, after)");
    expect(src).toContain('where("revieweeId", "==", revieweeId)');
  });

  it("reviewAggregateInputsChanged ignores comment-only edits", () => {
    expect(fnAgg.reviewAggregateInputsChanged({ rating: 4, revieweeId: "a", comment: "x" }, { rating: 4, revieweeId: "a", comment: "y" })).toBe(false);
    expect(fnAgg.reviewAggregateInputsChanged({ rating: 4, revieweeId: "a" }, { rating: 2, revieweeId: "a" })).toBe(true);
    expect(fnAgg.reviewAggregateInputsChanged({ rating: 4, revieweeId: "a" }, { rating: 4, revieweeId: "b" })).toBe(true);
  });

  it("submit-review still updates aggregates after writing the review", () => {
    const route = readFileSync(join(process.cwd(), "app/api/submit-review/route.ts"), "utf8");
    expect(route).toContain("incrementProfileReviewAggregates(revieweeId");
  });
});
