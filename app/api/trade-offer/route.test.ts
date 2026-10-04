import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  isAdminInitialized: vi.fn(() => true),
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, limit: 1 })),
  enforceProtection: vi.fn(async () => ({ allowed: true, blocked: false })),
  createSystemNotification: vi.fn(async () => undefined),
  txUpdate: vi.fn(),
  post: null as null | Record<string, unknown>,
  profile: null as null | Record<string, unknown>,
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { increment: (n: number) => ({ __inc: n }) } }));
vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: h.verifyIdToken,
  isAdminInitialized: h.isAdminInitialized,
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        __name: name,
        __id: id,
        get: async () => ({ exists: !!h.profile, data: () => h.profile }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: async () => ({ exists: !!h.post, data: () => h.post }), update: h.txUpdate }),
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

  it("429 when the per-user or per-post limit trips, before any write", async () => {
    h.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 1 });
    expect((await POST(req({ postId: "p1" }))).status).toBe(429);
    h.rateLimit.mockResolvedValueOnce({ allowed: true, remaining: 1, limit: 1 }).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 1 });
    expect((await POST(req({ postId: "p1" }))).status).toBe(429);
    expect(h.rateLimit.mock.calls.map((c) => (c as unknown[])[0])).toEqual(
      expect.arrayContaining(["trade-offer:uid:buyer-uid", "trade-offer:uid-post:buyer-uid:p1"])
    );
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
