import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, state } = vi.hoisted(() => {
  const state = {
    exists: true,
    listing: {} as Record<string, unknown>,
    updates: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
  };
  return {
    verifyIdTokenMock: vi.fn(),
    state,
  };
});

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id?: string) => ({ id: id ?? "generated-bid", collection: name }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
        update: (_ref: unknown, data: Record<string, unknown>) => void;
        create: (_ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) =>
      fn({
        get: async () => ({
          exists: state.exists,
          data: () => state.listing,
        }),
        update: (_ref, data) => {
          state.updates.push(data);
        },
        create: (_ref, data) => {
          state.creates.push(data);
        },
      }),
  }),
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 9, limit: 10 }),
}));

import { POST } from "../app/api/place-bid/route";

function placeBid(opts: {
  token?: { uid: string; email?: string } | null;
  body?: Record<string, unknown>;
  authorized?: boolean;
}) {
  if (opts.token) verifyIdTokenMock.mockResolvedValue(opts.token);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.authorized !== false) headers.authorization = "Bearer test-token";
  return POST(
    new NextRequest("http://localhost/api/place-bid", {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? { listingId: "list-1", amount: 20 }),
    })
  );
}

describe("place-bid identity", () => {
  beforeEach(() => {
    state.exists = true;
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    state.updates = [];
    state.creates = [];
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: "buyer-1", email: "buyer@example.test" });
  });

  it("T1 rejects a self-bid when sellerUid matches, even if emails differ", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "old-seller@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "seller-1", email: "new-seller@example.test" },
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cannot bid on your own listing" });
    expect(state.updates).toHaveLength(0);
  });

  it("T2 rejects a legacy email self-bid when no seller uid is stored", async () => {
    state.listing = {
      sellerEmail: "Seller@Example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "seller@example.test" },
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Cannot bid on your own listing" });
  });

  it("T3 rejects when highestBidderUid already matches, even if the email changed", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      highestBidderUid: "buyer-1",
      highestBidder: "old-buyer@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "new-buyer@example.test" },
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "You are already the highest bidder" });
  });

  it("T4 rejects a legacy email already-highest bid", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      highestBidder: "Buyer@Example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "buyer@example.test" },
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "You are already the highest bidder" });
  });

  it("T5 stamps the winner with both uid and email and returns the prior email", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      highestBidderUid: "prior-1",
      highestBidder: "prior@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "buyer@example.test" },
      body: { listingId: "list-1", amount: 20 },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      currentBid: 20,
      outbidUser: "prior@example.test",
    });
    expect(state.updates[0]).toMatchObject({
      highestBidder: "buyer@example.test",
      highestBidderUid: "buyer-1",
      currentBid: 20,
    });
  });

  it("T6 writes bidderUid and bidderEmail on bidHistory", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerId: "legacy-seller",
      sellerEmail: "seller@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "buyer@example.test" },
    });
    expect(res.status).toBe(200);
    expect(state.creates[0]).toMatchObject({
      bidderUid: "buyer-1",
      bidderEmail: "buyer@example.test",
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
    });
  });

  it("T6b stores sellerUid null when the listing has no seller uid", async () => {
    state.listing = {
      sellerEmail: "seller@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "buyer@example.test" },
    });
    expect(res.status).toBe(200);
    expect(state.creates[0]).toMatchObject({
      bidderUid: "buyer-1",
      bidderEmail: "buyer@example.test",
      sellerUid: null,
    });
  });

  it("does not treat a copied highest-bidder email as the current winner when uids differ", async () => {
    state.listing = {
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      highestBidderUid: "prior-1",
      highestBidder: "buyer@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    const res = await placeBid({
      token: { uid: "buyer-1", email: "buyer@example.test" },
    });
    expect(res.status).toBe(200);
    expect(state.updates[0]).toMatchObject({
      highestBidderUid: "buyer-1",
      highestBidder: "buyer@example.test",
    });
  });

  it("T7 rejects unauthenticated calls", async () => {
    const res = await placeBid({ authorized: false });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});

describe("place-bid identity source gates", () => {
  const src = readFileSync(path.join(process.cwd(), "app/api/place-bid/route.ts"), "utf8");

  it("does not compare highest bidder or seller by decoded.email", () => {
    expect(src).not.toContain("highestBidder === decoded.email");
    expect(src).not.toContain("decoded.email === sellerEmail");
    expect(src).not.toContain("decoded.email === highestBidder");
  });

  it("dual-writes highestBidderUid and stores bidderUid on bid history", () => {
    expect(src).toContain("changes.highestBidderUid = bidderUid");
    expect(src).toContain("bidderUid,");
    expect(src).toContain("sellerUid: sellerUid || null");
    expect(src.match(/changes\.highestBidderUid = bidderUid/g)?.length).toBe(3);
  });
});
