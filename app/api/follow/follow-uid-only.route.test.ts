/**
 * PROMPT-13 route tests: /api/follow writes uid-only edges (no follower/seller email) and keeps the
 * existing follow/unfollow behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  sets: [] as Array<[string, Record<string, unknown>]>,
  deletes: [] as string[],
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) },
}));
vi.mock("../../lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("../../lib/firebase-admin", () => {
  const ref = (path: string) => ({ path, get: async () => ({ exists: h.docs.has(path), data: () => h.docs.get(path) }) });
  return {
    verifyIdToken: async () => ({ uid: "fan1", email: "fan@example.com" }),
    isAdminInitialized: () => true,
    getAdminDb: () => ({
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          set: (r: { path: string }, d: Record<string, unknown>) => {
            h.sets.push([r.path, d]);
            h.docs.set(r.path, d);
          },
          update: (r: { path: string }, d: Record<string, { inc?: number }>) => {
            const cur = h.docs.get(r.path) || {};
            const n = Number(cur.followers || 0) + (d.followers?.inc || 0);
            h.docs.set(r.path, { ...cur, followers: n });
          },
          delete: (r: { path: string }) => {
            h.deletes.push(r.path);
            h.docs.delete(r.path);
          },
        }),
    }),
  };
});

import { NextRequest } from "next/server";
import { POST } from "./route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  h.docs.clear();
  h.sets = [];
  h.deletes = [];
  h.docs.set("profiles/seller1", { email: "seller@example.com", followers: 3 });
});

describe("/api/follow (uid-only edges)", () => {
  it("follow writes exactly {sellerId, followerId, createdAt} at sellerUid_followerUid", async () => {
    const res = await call({ sellerUid: "seller1", action: "follow" });
    expect(await res.json()).toEqual({ following: true, followerCount: 4 });
    expect(h.sets).toEqual([["followers/seller1_fan1", { sellerId: "seller1", followerId: "fan1", createdAt: "ts" }]]);
    expect(JSON.stringify(h.sets)).not.toMatch(/@/);
  });
  it("unfollow deletes the edge and decrements", async () => {
    h.docs.set("followers/seller1_fan1", { sellerId: "seller1", followerId: "fan1" });
    const res = await call({ sellerUid: "seller1", action: "unfollow" });
    expect(await res.json()).toEqual({ following: false, followerCount: 2 });
    expect(h.deletes).toEqual(["followers/seller1_fan1"]);
  });
  it("already following is idempotent (no write)", async () => {
    h.docs.set("followers/seller1_fan1", { sellerId: "seller1", followerId: "fan1" });
    expect(await (await call({ sellerUid: "seller1", action: "follow" })).json()).toEqual({ following: true, followerCount: 3 });
    expect(h.sets).toEqual([]);
  });
  it("self-follow 400, missing seller 404, allowFollowers:false 403, bad action 400", async () => {
    expect((await call({ sellerUid: "fan1", action: "follow" })).status).toBe(400);
    expect((await call({ sellerUid: "nobody", action: "follow" })).status).toBe(404);
    h.docs.set("profiles/closed", { allowFollowers: false });
    expect((await call({ sellerUid: "closed", action: "follow" })).status).toBe(403);
    expect((await call({ sellerUid: "seller1", action: "nope" })).status).toBe(400);
    expect(h.sets).toEqual([]);
  });
});
