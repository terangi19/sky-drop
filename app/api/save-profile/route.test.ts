import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Stored = Record<string, unknown>;

const h = vi.hoisted(() => {
  const docs = new Map<string, Stored>();
  const queries: { db: string; collection: string; field: string; value: string; limit: number }[] = [];
  const commits: { db: string; size: number }[] = [];
  const state = { failListings: false, uid: "seller-uid", email: "seller@test.com" };

  function makeDb(label: string) {
    function collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return {
            id,
            path,
            get: async () => {
              const data = docs.get(path);
              return { exists: docs.has(path), id, data: () => (data ? { ...data } : undefined) };
            },
            set: async (data: Stored, opts?: { merge?: boolean }) => {
              if (opts?.merge && docs.has(path)) docs.set(path, { ...docs.get(path), ...data });
              else docs.set(path, { ...data });
            },
            delete: async () => {
              docs.delete(path);
            },
            collection: (sub: string) => collection(`${path}/${sub}`),
          };
        },
        where(field: string, op: string, value: string) {
          if (label === "admin" && name === "listings" && state.failListings) {
            return { limit: () => ({ get: async () => { throw new Error("propagation boom seller@test.com"); } }) };
          }
          let lim = Number.POSITIVE_INFINITY;
          const query = {
            limit(n: number) {
              lim = n;
              return query;
            },
            get: async () => {
              if (op !== "==") throw new Error(`unexpected op ${op}`);
              queries.push({ db: label, collection: name, field, value, limit: lim });
              const prefix = `${name}/`;
              const found = [...docs.entries()]
                .filter(([path, data]) => {
                  if (!path.startsWith(prefix)) return false;
                  const rest = path.slice(prefix.length);
                  return !rest.includes("/") && data[field] === value;
                })
                .slice(0, lim)
                .map(([path]) => {
                  const id = path.slice(prefix.length);
                  return { id, ref: collection(name).doc(id) };
                });
              return { docs: found, size: found.length, empty: found.length === 0 };
            },
          };
          return query;
        },
      };
    }

    return {
      collection,
      batch() {
        const ops: { path: string; patch: Stored }[] = [];
        return {
          update(ref: { path: string }, patch: Stored) {
            ops.push({ path: ref.path, patch });
          },
          commit: async () => {
            if (ops.length > 400) throw new Error(`chunk ${ops.length} exceeds 400`);
            commits.push({ db: label, size: ops.length });
            for (const op of ops) {
              docs.set(op.path, { ...(docs.get(op.path) || {}), ...op.patch });
            }
          },
        };
      },
      runTransaction: async (fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { set: (data: Stored) => Promise<void> }, data: Stored) => Promise<void>;
        delete: (ref: { delete: () => Promise<void> }) => Promise<void>;
      }) => Promise<void>) => {
        await fn({
          get: (ref) => ref.get(),
          set: (ref, data) => ref.set(data),
          delete: (ref) => ref.delete(),
        });
      },
    };
  }

  return { docs, queries, commits, state, makeDb };
});

vi.mock("../../lib/csrf", () => ({
  requireCsrf: async () => {},
  CsrfError: class CsrfError extends Error {},
}));

vi.mock("../../lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: true, remaining: 4, limit: 5 }),
}));

vi.mock("../../lib/firebase-admin", () => ({
  verifyIdToken: async () => ({
    uid: h.state.uid,
    email: h.state.email,
    email_verified: true,
  }),
  getServerDb: () => h.makeDb("server"),
  getAdminDb: () => h.makeDb("admin"),
}));

import { POST } from "./route";
import { propagateSellerUsername } from "../../lib/propagate-seller-username.server";

function seedOwnedDocs() {
  h.docs.set("profiles/seller-uid", { username: "oldhandle", email: "seller@test.com" });
  h.docs.set("listings/mine", { sellerEmail: "seller@test.com", sellerUsername: "oldhandle" });
  h.docs.set("listings/other", { sellerEmail: "other@test.com", sellerUsername: "other" });
  h.docs.set("listings/body-email", { sellerEmail: "body-not-used@test.com", sellerUsername: "from-body" });
  h.docs.set("tradePosts/mine", { sellerEmail: "seller@test.com", sellerUsername: "oldhandle" });
  h.docs.set("tradePosts/other", { sellerEmail: "other@test.com", sellerUsername: "other" });
}

function post(username: string) {
  return new NextRequest("http://localhost/api/save-profile", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({
      username,
      email: "body-not-used@test.com",
      sellerUsername: "SpoofedHandle",
      bio: "hello",
    }),
  });
}

beforeEach(() => {
  h.docs.clear();
  h.queries.length = 0;
  h.commits.length = 0;
  h.state.failListings = false;
  h.state.uid = "seller-uid";
  h.state.email = "seller@test.com";
});

describe("POST /api/save-profile sellerUsername propagation", () => {
  it("updates only the caller's listings and trade posts when the username changes", async () => {
    seedOwnedDocs();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await POST(post("  newhandle!! "));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("newhandle");

    expect(h.docs.get("profiles/seller-uid")?.username).toBe("newhandle");
    expect(h.docs.get("listings/mine")?.sellerUsername).toBe("newhandle");
    expect(h.docs.get("tradePosts/mine")?.sellerUsername).toBe("newhandle");
    expect(h.docs.get("listings/other")?.sellerUsername).toBe("other");
    expect(h.docs.get("listings/body-email")?.sellerUsername).toBe("from-body");
    expect(h.docs.get("tradePosts/other")?.sellerUsername).toBe("other");

    const ownedQueries = h.queries.filter((q) => q.collection === "listings" || q.collection === "tradePosts");
    expect(ownedQueries.length).toBeGreaterThan(0);
    expect(ownedQueries.every((q) => q.db === "admin" && q.field === "sellerEmail" && q.value === "seller@test.com")).toBe(true);
    expect(ownedQueries.some((q) => q.value === "body-not-used@test.com")).toBe(false);

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("sellerUsername propagated");
    expect(logged).not.toContain("seller@test.com");
    expect(logged).not.toContain("newhandle");
    expect(logged).not.toContain("SpoofedHandle");
    info.mockRestore();
  });

  it("does not touch listings or trade posts when the username is unchanged", async () => {
    seedOwnedDocs();
    const res = await POST(post("oldhandle"));
    expect(res.status).toBe(200);
    expect(h.docs.get("listings/mine")?.sellerUsername).toBe("oldhandle");
    expect(h.docs.get("tradePosts/mine")?.sellerUsername).toBe("oldhandle");
    expect(h.queries.filter((q) => q.collection === "listings" || q.collection === "tradePosts")).toEqual([]);
    expect(h.commits).toEqual([]);
  });

  it("still saves the profile when propagation fails", async () => {
    seedOwnedDocs();
    h.state.failListings = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post("newhandle"));
    expect(res.status).toBe(200);
    expect((await res.json()).username).toBe("newhandle");
    expect(h.docs.get("profiles/seller-uid")?.username).toBe("newhandle");
    expect(h.docs.get("listings/mine")?.sellerUsername).toBe("oldhandle");
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain("sellerUsername propagation failed");
    expect(logged).not.toContain("seller@test.com");
    err.mockRestore();
  });
});

describe("propagateSellerUsername batches", () => {
  it("chunks at 400 and caps the total at 2000", async () => {
    const store = new Map<string, Stored>();
    for (let i = 0; i < 2005; i++) {
      store.set(`listings/l${i}`, { sellerEmail: "seller@test.com", sellerUsername: "old" });
    }
    for (let i = 0; i < 10; i++) {
      store.set(`tradePosts/t${i}`, { sellerEmail: "seller@test.com", sellerUsername: "old" });
    }
    store.set("listings/stranger", { sellerEmail: "other@test.com", sellerUsername: "keep" });
    const sizes: number[] = [];

    function collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return { id, path };
        },
        where(field: string, op: string, value: string) {
          let lim = Number.POSITIVE_INFINITY;
          const query = {
            limit(n: number) {
              lim = n;
              return query;
            },
            get: async () => {
              expect(op).toBe("==");
              expect(field).toBe("sellerEmail");
              const prefix = `${name}/`;
              const found = [...store.entries()]
                .filter(([path, data]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && data[field] === value)
                .slice(0, lim)
                .map(([path]) => ({ ref: collection(name).doc(path.slice(prefix.length)) }));
              return { docs: found, size: found.length };
            },
          };
          return query;
        },
      };
    }

    const db = {
      collection,
      batch() {
        const ops: { path: string; patch: Stored }[] = [];
        return {
          update(ref: { path?: string }, patch: Stored) {
            if (!ref.path) throw new Error("missing ref path");
            ops.push({ path: ref.path, patch });
          },
          commit: async () => {
            expect(ops.length).toBeLessThanOrEqual(400);
            sizes.push(ops.length);
            for (const op of ops) store.set(op.path, { ...(store.get(op.path) || {}), ...op.patch });
          },
        };
      },
    };

    const counts = await propagateSellerUsername(
      "seller@test.com",
      "newhandle",
      db as never
    );
    expect(counts).toEqual({ listings: 2000, tradePosts: 0, capped: true });
    expect(sizes).toEqual([400, 400, 400, 400, 400]);
    expect(store.get("listings/l0")?.sellerUsername).toBe("newhandle");
    expect(store.get("listings/l1999")?.sellerUsername).toBe("newhandle");
    expect(store.get("listings/l2000")?.sellerUsername).toBe("old");
    expect(store.get("tradePosts/t0")?.sellerUsername).toBe("old");
    expect(store.get("listings/stranger")?.sellerUsername).toBe("keep");
  });
});
