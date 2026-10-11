import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectionResult } from "../../lib/enforce-protection";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  isAdminInitialized: vi.fn(() => true),
  rateLimit: vi.fn(async (_key: string, _max?: number, _windowMs?: number) => ({ allowed: true, remaining: 1, limit: 1 })),
  enforceProtection: vi.fn(async (..._args: unknown[]): Promise<ProtectionResult> => ({ allowed: true, blocked: false })),
  createSystemNotification: vi.fn(async () => undefined),
  txUpdate: vi.fn(),
  txSet: vi.fn(),
  post: null as null | Record<string, unknown>,
  profile: null as null | Record<string, unknown>,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: h.isAdminInitialized,
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        __name: name,
        __id: id,
        get: async () => ({ exists: !!h.profile, data: () => h.profile }),
        collection: (sub: string) => ({
          doc: (subId: string) => ({ __name: sub, __id: subId, __parent: id }),
        }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { __name?: string }) => {
          if (ref?.__name === "offerers") {
            return { exists: false, data: () => null, get: () => undefined };
          }
          return { exists: !!h.post, data: () => h.post, get: (field: string) => h.post?.[field] };
        },
        update: h.txUpdate,
        set: h.txSet,
      }),
  }),
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: h.rateLimit }));
vi.mock("../../lib/enforce-protection", () => ({ enforceProtection: h.enforceProtection }));
vi.mock("../../lib/system-notifications", () => ({ createSystemNotification: h.createSystemNotification }));

import { NextRequest } from "next/server";
import { POST } from "./route";

function req(body: unknown, token: string | null = "tok") {
  return new NextRequest("http://localhost/api/trade-offer", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isAdminInitialized.mockReturnValue(true);
  h.verifyIdToken.mockResolvedValue({ uid: "buyer-uid", email: "Buyer@Example.com", auth_time: 1 });
  h.rateLimit.mockReset();
  h.rateLimit.mockResolvedValue({ allowed: true, remaining: 1, limit: 1 });
  h.enforceProtection.mockResolvedValue({ allowed: true, blocked: false });
  h.post = { sellerEmail: "seller@example.com", sellerId: "seller-uid", status: "live", title: "Rare card", offers: 2, images: ["https://x.test/a.jpg"] };
  h.profile = { username: "kiwi_trader" };
});

describe("POST /api/trade-offer", () => {
  it("401 without a bearer token / with a bad token; writes nothing", async () => {
    expect((await POST(req({ postId: "p1" }, null))).status).toBe(401);
    h.verifyIdToken.mockRejectedValueOnce(new Error("bad"));
    expect((await POST(req({ postId: "p1" }))).status).toBe(401);
    expect(h.txUpdate).not.toHaveBeenCalled();
    expect(h.createSystemNotification).not.toHaveBeenCalled();
  });

  it("400 on invalid body / unsafe postId", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ postId: "a/b" }))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
  });

  it("checks the per-post limiter BEFORE the per-user limiter", async () => {
    expect((await POST(req({ postId: "p1" }))).status).toBe(200);
    expect(h.rateLimit.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "trade-offer:uid-post:buyer-uid:p1",
      "trade-offer:uid:buyer-uid",
    ]);
    // config passed through unchanged: 3 / 10 min per post, 20 / 1 h per user
    expect((h.rateLimit.mock.calls[0] as unknown[]).slice(1)).toEqual([3, 10 * 60 * 1000]);
    expect((h.rateLimit.mock.calls[1] as unknown[]).slice(1)).toEqual([20, 60 * 60 * 1000]);
  });

  it("429 scope:post + Retry-After 600 when the per-post limit trips; per-user limiter is never called/charged", async () => {
    h.rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("trade-offer:uid-post:")
        ? { allowed: false, remaining: 0, limit: 3 }
        : { allowed: true, remaining: 19, limit: 20 }
    );
    const res = await POST(req({ postId: "p1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(await res.json()).toEqual({
      error: expect.any(String),
      code: "rate_limited",
      scope: "post",
    });
    expect(h.rateLimit).toHaveBeenCalledTimes(1);
    expect(h.rateLimit.mock.calls.map((c) => (c as unknown[])[0])).not.toContain("trade-offer:uid:buyer-uid");
    expect(h.enforceProtection).not.toHaveBeenCalled();
    expect(h.txUpdate).not.toHaveBeenCalled();
    expect(h.createSystemNotification).not.toHaveBeenCalled();
  });

  it("429 scope:user + Retry-After 3600 when the per-user limit trips (after the per-post check passed)", async () => {
    h.rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("trade-offer:uid:")
        ? { allowed: false, remaining: 0, limit: 20 }
        : { allowed: true, remaining: 2, limit: 3 }
    );
    const res = await POST(req({ postId: "p2" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(await res.json()).toEqual({
      error: expect.any(String),
      code: "rate_limited",
      scope: "user",
    });
    expect(h.rateLimit.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      "trade-offer:uid-post:buyer-uid:p2",
      "trade-offer:uid:buyer-uid",
    ]);
    expect(h.enforceProtection).not.toHaveBeenCalled();
    expect(h.txUpdate).not.toHaveBeenCalled();
  });

  it("returns the gateway response when enforceProtection blocks (e.g. 409 replay)", async () => {
    const blocked = new Response(JSON.stringify({ error: "This action was already submitted" }), { status: 409 });
    h.enforceProtection.mockResolvedValueOnce({ allowed: false, blocked: true, response: blocked as never });
    expect((await POST(req({ postId: "p1", requestId: "req-12345678" }))).status).toBe(409);
    expect(h.txUpdate).not.toHaveBeenCalled();
  });

  it("404 when the post is missing, 409 when sold, 400 for the owner; none write or notify", async () => {
    h.post = null;
    expect((await POST(req({ postId: "p1" }))).status).toBe(404);
    h.post = { sellerEmail: "seller@example.com", status: "sold" };
    expect((await POST(req({ postId: "p1" }))).status).toBe(409);
    h.post = { sellerEmail: "buyer@example.com", status: "live" };
    const own = await POST(req({ postId: "p1" }));
    expect(own.status).toBe(400);
    expect((await own.json()).code).toBe("own_post");
    expect(h.txUpdate).not.toHaveBeenCalled();
    expect(h.createSystemNotification).not.toHaveBeenCalled();
  });

  it("403 for a restricted buyer", async () => {
    h.profile = { restricted: true };
    expect((await POST(req({ postId: "p1" }))).status).toBe(403);
    expect(h.txUpdate).not.toHaveBeenCalled();
  });

  it("200: increments atomically, notifies the seller server-side, ignores client-supplied counters", async () => {
    const res = await POST(req({ postId: "p1", offers: 999999, sellerEmail: "evil@x.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, offers: 3, notified: true });
    expect(h.txUpdate).toHaveBeenCalledTimes(1);
    const [ref, patch] = h.txUpdate.mock.calls[0] as unknown as [{ __name: string; __id: string }, Record<string, unknown>];
    expect(ref.__name).toBe("tradePosts");
    expect(ref.__id).toBe("p1");
    expect(patch).toEqual({ offers: { __inc: 1 } });
    expect(h.createSystemNotification).toHaveBeenCalledWith({
      targetEmail: "seller@example.com",
      fromEmail: "buyer@example.com",
      type: "offer",
      title: "New offer received! 💰",
      message: 'kiwi_trader sent an offer on "Rare card".',
      listingId: "p1",
      listingTitle: "Rare card",
      listingImage: "https://x.test/a.jpg",
    });
  });

  it("200 with notified:false (and no throw) when the notification write fails", async () => {
    h.createSystemNotification.mockRejectedValueOnce(new Error("firestore down"));
    const res = await POST(req({ postId: "p1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, notified: false });
  });

  it("500 (not success) when the transaction throws", async () => {
    h.verifyIdToken.mockResolvedValueOnce({ uid: "buyer-uid", email: "b@e.com" });
    h.txUpdate.mockImplementationOnce(() => { throw new Error("aborted"); });
    const res = await POST(req({ postId: "p1" }));
    expect(res.status).toBe(500);
    expect(h.createSystemNotification).not.toHaveBeenCalled();
  });
});
