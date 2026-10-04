import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdTokenMock, state } = vi.hoisted(() => {
  const state = {
    exists: true,
    listing: {} as Record<string, unknown>,
    updates: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
    profile: {} as Record<string, unknown> | null,
    profileError: null as Error | null,
    transactions: 0,
    profileReads: [] as string[],
  };
  return { verifyIdTokenMock: vi.fn(), state };
});

vi.mock("../app/lib/firebase-admin", () => ({
  isAdminInitialized: () => true,
  verifyIdToken: (...args: unknown[]) => verifyIdTokenMock(...args),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id?: string) => ({
        id: id ?? "generated-bid",
        get: async () => {
          state.profileReads.push(`${name}/${id ?? ""}`);
          if (state.profileError) throw state.profileError;
          return {
            exists: state.profile != null,
            data: () => state.profile ?? undefined,
          };
        },
      }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
        update: (_ref: unknown, data: Record<string, unknown>) => void;
        create: (_ref: unknown, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      state.transactions += 1;
      return fn({
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
      });
    },
  }),
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 9, limit: 10 }),
}));

import { POST } from "../app/api/place-bid/route";

function placeBid(body?: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/place-bid", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-token",
      },
      body: JSON.stringify(body ?? { listingId: "list-1", amount: 20 }),
    })
  );
}

describe("place-bid auction and restricted guards", () => {
  beforeEach(() => {
    state.exists = true;
    state.listing = {
      saleType: "auction",
      sellerUid: "seller-1",
      sellerEmail: "seller@example.test",
      startingBid: 10,
      currentBid: 10,
    };
    state.updates = [];
    state.creates = [];
    state.profile = {};
    state.profileError = null;
    state.transactions = 0;
    state.profileReads = [];
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: "buyer-1", email: "buyer@example.test" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a fixed-price listing with 400 and does not write", async () => {
    state.listing = { ...state.listing, saleType: "fixed" };
    const res = await placeBid();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "This listing is not an auction" });
    expect(state.updates).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });

  it("rejects a buy_now listing with 400 and does not write", async () => {
    state.listing = { ...state.listing, saleType: "buy_now" };
    const res = await placeBid();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "This listing is not an auction" });
    expect(state.updates).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });

  it("still accepts auction_buy_now", async () => {
    state.listing = { ...state.listing, saleType: "auction_buy_now" };
    const res = await placeBid();
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.creates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      highestBidderUid: "buyer-1",
      currentBid: 20,
    });
  });

  it.each([true, "true"] as const)("rejects restricted=%j with 403 and does not open a transaction", async (restricted) => {
    state.profile = { restricted };
    const res = await placeBid();
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: "Your account is restricted. You cannot bid.",
    });
    expect(state.transactions).toBe(0);
    expect(state.updates).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
    expect(state.profileReads).toEqual(["profiles/buyer-1"]);
  });

  it("fails closed with 503 when the profile read throws and does not leak the error", async () => {
    state.profileError = new Error("projects/secret-bucket profile unavailable");
    const res = await placeBid();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to place bid" });
    expect(JSON.stringify(body)).not.toContain("secret-bucket");
    expect(state.transactions).toBe(0);
    expect(state.updates).toHaveLength(0);
    expect(state.creates).toHaveLength(0);
  });
});
