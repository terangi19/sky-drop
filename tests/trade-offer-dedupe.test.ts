import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const DAY_MS = 24 * 60 * 60 * 1000;

type OfferDoc = { lastOfferAt?: { toMillis: () => number } };
type Ref = { kind: string; id: string };

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  profile: { username: "kiwi_trader" } as Record<string, unknown> | null,
  profileError: null as Error | null,
  post: null as Record<string, unknown> | null,
  offerers: new Map<string, OfferDoc>(),
  notifications: [] as unknown[],
  transactions: 0,
  updates: 0,
  sets: 0,
  now: 1_700_000_000_000,
}));

function freshPost(): Record<string, unknown> {
  return {
    sellerEmail: "seller@example.com",
    sellerId: "seller-uid",
    status: "live",
    title: "Rare card",
    offers: 2,
    images: ["https://x.test/a.jpg"],
  };
}

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

vi.mock("../app/lib/firebase-admin", () => ({
  verifyIdToken: (...args: unknown[]) => h.verifyIdToken(...args),
  isAdminInitialized: () => true,
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        kind: name === "tradePosts" ? "post" : name,
        id,
        get: async () => {
          if (h.profileError) throw h.profileError;
          return { exists: h.profile != null, data: () => h.profile };
        },
        collection: (sub: string) => ({
          doc: (subId: string) => ({ kind: sub, id: `${id}/${subId}` }),
        }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.transactions += 1;
      return fn({
        get: async (ref: Ref) => {
          if (ref.kind === "offerers") {
            const doc = h.offerers.get(ref.id);
            return {
              exists: !!doc,
              data: () => doc ?? null,
              get: (field: string) => (doc ? (doc as Record<string, unknown>)[field] : undefined),
            };
          }
          return {
            exists: h.post != null,
            data: () => h.post,
            get: (field: string) => (h.post ? h.post[field] : undefined),
          };
        },
        update: (ref: Ref, data: { offers?: { __inc: number } }) => {
          if (ref.kind !== "post" || !h.post) throw new Error(`unexpected update on ${ref.kind}`);
          h.updates += 1;
          if (data.offers && typeof data.offers.__inc === "number") {
            const current = Number(h.post.offers);
            const base = Number.isFinite(current) && current > 0 ? current : 0;
            h.post.offers = base + data.offers.__inc;
          }
        },
        set: (ref: Ref, data: { lastOfferAt?: { __serverTimestamp?: boolean } }) => {
          if (ref.kind !== "offerers") throw new Error(`unexpected set on ${ref.kind}`);
          h.sets += 1;
          const writtenAt = h.now;
          const prev = h.offerers.get(ref.id) ?? {};
          const lastOfferAt = data.lastOfferAt?.__serverTimestamp
            ? { toMillis: () => writtenAt }
            : prev.lastOfferAt;
          h.offerers.set(ref.id, { ...prev, lastOfferAt });
        },
      });
    },
  }),
}));

vi.mock("../app/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 1, limit: 1 }),
}));

vi.mock("../app/lib/enforce-protection", () => ({
  enforceProtection: async () => ({ allowed: true, blocked: false }),
}));

vi.mock("../app/lib/system-notifications", () => ({
  createSystemNotification: async (input: unknown) => {
    h.notifications.push(input);
  },
}));

import { POST } from "../app/api/trade-offer/route";

function offer(postId = "p1", token = "tok") {
  return POST(
    new NextRequest("http://localhost/api/trade-offer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ postId }),
    })
  );
}

describe("trade-offer per-buyer counting", () => {
  beforeEach(() => {
    h.profile = { username: "kiwi_trader" };
    h.profileError = null;
    h.post = freshPost();
    h.offerers.clear();
    h.notifications.length = 0;
    h.transactions = 0;
    h.updates = 0;
    h.sets = 0;
    h.now = 1_700_000_000_000;
    h.verifyIdToken.mockReset();
    h.verifyIdToken.mockResolvedValue({ uid: "buyer-uid", email: "Buyer@Example.com", auth_time: 1 });
    vi.spyOn(Date, "now").mockImplementation(() => h.now);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts and notifies the same buyer once inside 24h", async () => {
    const first = await offer();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ success: true, offers: 3, notified: true });

    h.now += 60 * 60 * 1000;
    const second = await offer();
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({
      success: true,
      offers: 3,
      notified: false,
      duplicate: true,
    });

    expect(h.post?.offers).toBe(3);
    expect(h.updates).toBe(1);
    expect(h.sets).toBe(2);
    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0]).toMatchObject({
      targetEmail: "seller@example.com",
      fromEmail: "buyer@example.com",
      type: "offer",
      listingId: "p1",
    });
  });

  it("counts again after 24h", async () => {
    expect((await offer()).status).toBe(200);
    h.now += DAY_MS + 1;
    const again = await offer();
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ success: true, offers: 4, notified: true });
    expect(h.post?.offers).toBe(4);
    expect(h.updates).toBe(2);
    expect(h.notifications).toHaveLength(2);
  });

  it("counts two buyers separately", async () => {
    h.verifyIdToken.mockResolvedValueOnce({ uid: "buyer-a", email: "a@example.com", auth_time: 1 });
    const a = await offer();
    expect(a.status).toBe(200);
    await expect(a.json()).resolves.toMatchObject({ success: true, offers: 3, notified: true });

    h.verifyIdToken.mockResolvedValueOnce({ uid: "buyer-b", email: "b@example.com", auth_time: 1 });
    const b = await offer();
    expect(b.status).toBe(200);
    await expect(b.json()).resolves.toMatchObject({ success: true, offers: 4, notified: true });

    expect(h.post?.offers).toBe(4);
    expect(h.updates).toBe(2);
    expect(h.notifications).toHaveLength(2);
    expect(h.offerers.has("p1/buyer-a")).toBe(true);
    expect(h.offerers.has("p1/buyer-b")).toBe(true);
  });

  it("does not write the counter or offerer when the post rejects the buyer", async () => {
    h.verifyIdToken.mockResolvedValue({ uid: "buyer-uid", email: "seller@example.com", auth_time: 1 });
    const res = await offer();
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("own_post");
    expect(h.post?.offers).toBe(2);
    expect(h.updates).toBe(0);
    expect(h.sets).toBe(0);
    expect(h.offerers.size).toBe(0);
    expect(h.notifications).toHaveLength(0);
  });

  it("fails closed with 503 when the profile read throws and does not leak the error", async () => {
    h.profileError = new Error("projects/secret-bucket profile unavailable");
    const res = await offer();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Please try again", code: "profile_unavailable" });
    expect(JSON.stringify(body)).not.toContain("secret-bucket");
    expect(h.transactions).toBe(0);
    expect(h.updates).toBe(0);
    expect(h.post?.offers).toBe(2);
    expect(h.notifications).toHaveLength(0);
  });
});
