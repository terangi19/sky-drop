import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  isAdminInitialized: vi.fn(() => true),
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, limit: 1 })),
  incrementAggregates: vi.fn(async () => undefined),
  getProfileByEmail: vi.fn(async (email: string) => ({ uid: `uid-of-${email}` })),
  purchases: new Map<string, Doc>(),
  reviews: new Map<string, Doc>(),
  txCreate: vi.fn(),
  txUpdate: vi.fn(),
  failCreateWithAlreadyExists: false,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
}));

function store(name: string): Map<string, Doc> {
  return name === "purchases" ? h.purchases : h.reviews;
}

vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: h.isAdminInitialized,
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        __name: name,
        __id: id,
        get: async () => {
          const d = store(name).get(id);
          return { exists: !!d, data: () => d };
        },
      }),
      where: (field: string, _op: string, value: unknown) => ({
        limit: () => ({
          get: async () => ({
            docs: [...store(name).values()]
              .filter((d) => d[field] === value)
              .map((d) => ({ data: () => d })),
          }),
        }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { __name: string; __id: string }) => {
          const d = store(ref.__name).get(ref.__id);
          return { exists: !!d, data: () => d };
        },
        create: (ref: { __name: string; __id: string }, data: Doc) => {
          h.txCreate(ref, data);
          if (h.failCreateWithAlreadyExists || store(ref.__name).has(ref.__id)) {
            throw Object.assign(new Error("6 ALREADY_EXISTS"), { code: 6 });
          }
          store(ref.__name).set(ref.__id, data);
        },
        update: (ref: { __name: string; __id: string }, patch: Doc) => {
          h.txUpdate(ref, patch);
          const cur = store(ref.__name).get(ref.__id) || {};
          store(ref.__name).set(ref.__id, { ...cur, ...patch });
        },
      }),
  }),
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("../../lib/review-aggregates", () => ({ incrementProfileReviewAggregates: h.incrementAggregates }));
vi.mock("../../lib/profile-display-admin", () => ({
  adminGetProfileByEmail: h.getProfileByEmail,
  adminGetPublicHandle: async (_email: string, fallback: string) => fallback,
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const BUYER = { uid: "buyer-uid", email: "buyer@example.com", email_verified: true };
const SELLER = { uid: "seller-uid", email: "seller@example.com", email_verified: true };

function req(body: unknown) {
  return new NextRequest("http://localhost/api/submit-review", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });
}

const review = (purchaseId = "p1") => req({ purchaseId, rating: 5, reviewText: "Great" });

beforeEach(() => {
  vi.clearAllMocks();
  h.purchases.clear();
  h.reviews.clear();
  h.failCreateWithAlreadyExists = false;
  h.isAdminInitialized.mockReturnValue(true);
  h.rateLimit.mockResolvedValue({ allowed: true, remaining: 1, limit: 1 });
  h.verifyIdToken.mockResolvedValue(BUYER);
  h.purchases.set("p1", {
    buyerEmail: BUYER.email,
    sellerEmail: SELLER.email,
    status: "delivered",
    listingId: "l1",
    listingTitle: "Bike",
  });
});

describe("POST /api/submit-review: `reviewed` is not trusted", () => {
  it("a seller-set reviewed=true does not block the buyer's review", async () => {
    h.purchases.set("p1", { ...h.purchases.get("p1")!, reviewed: true });
    const res = await POST(review());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, reviewId: "p1_buyer-uid", role: "buyer" });
    expect(h.reviews.has("p1_buyer-uid")).toBe(true);
    expect(h.purchases.get("p1")).toMatchObject({ buyerReviewed: true, reviewed: true });
    expect(h.incrementAggregates).toHaveBeenCalledTimes(1);
  });

  it("legacy reviewed=true WITH an existing buyer review (any doc id) is rejected 409", async () => {
    h.purchases.set("p1", { ...h.purchases.get("p1")!, reviewed: true });
    h.reviews.set("legacy-auto-id", { purchaseId: "p1", reviewerEmail: BUYER.email, rating: 4 });
    const res = await POST(review());
    expect(res.status).toBe(409);
    expect(h.txCreate).not.toHaveBeenCalled();
    expect(h.incrementAggregates).not.toHaveBeenCalled();
  });

  it("a legacy SELLER review does not count as the buyer's review", async () => {
    h.purchases.set("p1", { ...h.purchases.get("p1")!, reviewed: true });
    h.reviews.set("p1_seller-uid", {
      purchaseId: "p1", reviewerId: SELLER.uid, reviewerEmail: SELLER.email, role: "seller",
      buyerEmail: BUYER.email, sellerEmail: SELLER.email,
    });
    expect((await POST(review())).status).toBe(200);
  });

  it("buyer resetting reviewed=false cannot review twice (server-only buyerReviewed + doc id)", async () => {
    expect((await POST(review())).status).toBe(200);
    h.purchases.set("p1", { ...h.purchases.get("p1")!, reviewed: false });
    const second = await POST(review());
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "You already reviewed this order" });
    expect(h.incrementAggregates).toHaveBeenCalledTimes(1);
  });

  it("second review is rejected 409 even if buyerReviewed were cleared (review doc exists)", async () => {
    expect((await POST(review())).status).toBe(200);
    const p = { ...h.purchases.get("p1")! };
    delete p.buyerReviewed;
    p.reviewed = false;
    h.purchases.set("p1", p);
    expect((await POST(review())).status).toBe(409);
    expect(h.incrementAggregates).toHaveBeenCalledTimes(1);
  });

  it("a concurrent duplicate that loses tx.create gets 409 and no aggregate bump", async () => {
    h.failCreateWithAlreadyExists = true;
    const res = await POST(review());
    expect(res.status).toBe(409);
    expect(h.incrementAggregates).not.toHaveBeenCalled();
  });

  it("non-party is rejected 403 and nothing is written", async () => {
    h.verifyIdToken.mockResolvedValue({ uid: "x", email: "stranger@example.com", email_verified: true });
    expect((await POST(review())).status).toBe(403);
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("ineligible status (not yet delivered / refunded) is rejected 400", async () => {
    for (const status of ["seller_confirming", "shipped", "refunded", "cancelled"]) {
      h.purchases.set("p1", { ...h.purchases.get("p1")!, status });
      expect((await POST(review())).status).toBe(400);
    }
    expect(h.txCreate).not.toHaveBeenCalled();
  });

  it("active dispute is rejected 400", async () => {
    h.purchases.set("p1", { ...h.purchases.get("p1")!, disputeStatus: "open" });
    expect((await POST(review())).status).toBe(400);
  });

  it("seller can still leave their own review; buyer's reviewed flag is irrelevant to it", async () => {
    h.verifyIdToken.mockResolvedValue(SELLER);
    h.purchases.set("p1", { ...h.purchases.get("p1")!, reviewed: true });
    const res = await POST(review());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "seller", reviewId: "p1_seller-uid" });
    expect(h.purchases.get("p1")).toMatchObject({ sellerReviewed: true });
    expect(h.purchases.get("p1")!.buyerReviewed).toBeUndefined();
  });

  it("404 for a missing purchase; 401 for a bad token; 403 for unverified email", async () => {
    expect((await POST(review("nope"))).status).toBe(404);
    h.verifyIdToken.mockRejectedValueOnce(new Error("bad"));
    expect((await POST(review())).status).toBe(401);
    h.verifyIdToken.mockResolvedValueOnce({ ...BUYER, email_verified: false });
    expect((await POST(review())).status).toBe(403);
  });

  it("500 errors are sanitized", async () => {
    h.getProfileByEmail.mockRejectedValueOnce(new Error("internal secret detail"));
    const res = await POST(review());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to submit review" });
  });
});
