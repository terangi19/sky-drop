import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) },
}));

import { followEdgeData, followEdgeId, FOLLOW_EDGE_KEYS, removeFollowEdgesForUser } from "./follow-edges.server";

type Doc = Record<string, unknown>;
const edges = new Map<string, Doc>();
const commits: Array<Array<[string, string, unknown?]>> = [];

const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}` }),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => {
        const docs = [...edges.entries()]
          .filter(([, d]) => d[field] === value)
          .map(([id, d]) => ({ id, ref: { path: `followers/${id}` }, get: (k: string) => d[k] }));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    }),
  }),
  batch: () => {
    const ops: Array<[string, string, unknown?]> = [];
    return {
      delete: (ref: { path: string }) => ops.push(["delete", ref.path]),
      set: (ref: { path: string }, data: unknown) => ops.push(["set", ref.path, data]),
      commit: async () => void commits.push(ops),
    };
  },
};

beforeEach(() => {
  edges.clear();
  commits.length = 0;
});

describe("follow edge shape", () => {
  it("is uid-only: sellerId, followerId, createdAt — no emails", () => {
    const data = followEdgeData("s1", "f1");
    expect(Object.keys(data).sort()).toEqual([...FOLLOW_EDGE_KEYS].sort());
    expect(JSON.stringify(data)).not.toMatch(/@|Email/);
    expect(followEdgeId("s1", "f1")).toBe("s1_f1");
  });
});

describe("removeFollowEdgesForUser (ban cleanup)", () => {
  it("removes incoming edges (zeroes own count) and outgoing edges (decrements each seller)", async () => {
    edges.set("bad_f1", { sellerId: "bad", followerId: "f1" });
    edges.set("bad_f2", { sellerId: "bad", followerId: "f2" });
    edges.set("s9_bad", { sellerId: "s9", followerId: "bad" });
    edges.set("s9_f1", { sellerId: "s9", followerId: "f1" });
    expect(await removeFollowEdgesForUser(fakeDb as never, "bad")).toEqual({ followersRemoved: 2, followingRemoved: 1 });
    const ops = commits.flat();
    expect(ops.filter((o) => o[0] === "delete").map((o) => o[1]).sort()).toEqual(
      ["followers/bad_f1", "followers/bad_f2", "followers/s9_bad"]
    );
    expect(ops).toContainEqual(["set", "profiles/bad", { followers: 0 }]);
    expect(ops).toContainEqual(["set", "profiles/s9", { followers: { inc: -1 } }]);
    expect(ops.some((o) => o[1] === "followers/s9_f1")).toBe(false);
  });
  it("legacy followingId-only docs are not matched (field never used by edges)", async () => {
    edges.set("x", { followingId: "bad" });
    expect(await removeFollowEdgesForUser(fakeDb as never, "bad")).toEqual({ followersRemoved: 0, followingRemoved: 0 });
    expect(commits).toEqual([]);
  });
  it("chunks large fan-outs under the 500-op batch limit", async () => {
    for (let i = 0; i < 950; i++) edges.set(`bad_f${i}`, { sellerId: "bad", followerId: `f${i}` });
    await removeFollowEdgesForUser(fakeDb as never, "bad");
    expect(commits.length).toBe(3);
    expect(Math.max(...commits.map((c) => c.length))).toBeLessThanOrEqual(400);
    expect(commits.flat().length).toBe(951);
  });
  it("no-op without uid", async () => {
    expect(await removeFollowEdgesForUser(fakeDb as never, "")).toEqual({ followersRemoved: 0, followingRemoved: 0 });
  });
});
