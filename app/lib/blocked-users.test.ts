import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>(); // "users/me/blocked/id" -> data
const touchedCollections: string[] = [];
const lookups: string[] = [];
let lookupResult: { uid?: string } | null = null;
let lookupThrows = false;

vi.mock("firebase/firestore", () => {
  const path = (...segs: unknown[]) => segs.slice(1).join("/");
  return {
    doc: (...a: unknown[]) => ({ path: path(...a) }),
    collection: (...a: unknown[]) => {
      const p = path(...a);
      touchedCollections.push(p);
      return { path: p };
    },
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    limit: (n: number) => ({ n }),
    query: (col: { path: string }, ...c: Array<{ field?: string; value?: unknown }>) => ({ col, c }),
    serverTimestamp: () => "SERVER_TS",
    setDoc: async (ref: { path: string }, data: Doc) => void store.set(ref.path, data),
    deleteDoc: async (ref: { path: string }) => void store.delete(ref.path),
    getDoc: async (ref: { path: string }) => ({
      exists: () => store.has(ref.path),
      id: ref.path.split("/").pop(),
    }),
    getDocs: async (q: { col: { path: string }; c: Array<{ field?: string; value?: unknown }> }) => {
      const eq = q.c.find((x) => x.field);
      const docs = [...store.entries()]
        .filter(([k, v]) => k.startsWith(q.col.path + "/") && (!eq || v[eq.field as string] === eq.value))
        .map(([k, v]) => ({ id: k.split("/").pop() as string, data: () => v }));
      return { docs, empty: docs.length === 0 };
    },
  };
});
vi.mock("./fetch-public-profile-client", () => ({
  fetchPublicProfileBySlug: async (slug: string) => {
    lookups.push(slug);
    if (lookupThrows) throw new Error("network");
    return lookupResult;
  },
}));

import {
  buildBlockedDoc,
  findBlockedDocIds,
  removeBlockedDocs,
  resolveBlockedUid,
  saveBlockedUser,
} from "./blocked-users";
import { blockedEmailsFromDocs } from "./messages-unread";

const db = {} as never;

beforeEach(() => {
  store.clear();
  touchedCollections.length = 0;
  lookups.length = 0;
  lookupResult = { uid: "uidSELLER0123456789abcd" };
  lookupThrows = false;
});

describe("saveBlockedUser keys the block by uid", () => {
  it("resolves the uid through the public identity API and writes users/me/blocked/{uid}", async () => {
    const res = await saveBlockedUser(db, "me", "Seller@Example.com ");
    expect(lookups).toEqual(["seller@example.com"]);
    expect(res).toEqual({ id: "uidSELLER0123456789abcd", uidResolved: true });
    const written = store.get("users/me/blocked/uidSELLER0123456789abcd");
    expect(written).toMatchObject({
      blockedUid: "uidSELLER0123456789abcd",
      blockedEmail: "seller@example.com",
      createdAt: "SERVER_TS",
    });
  });

  it("never queries the owner-only profiles collection", async () => {
    await saveBlockedUser(db, "me", "seller@example.com");
    expect(touchedCollections.some((p) => p.startsWith("profiles"))).toBe(false);
  });

  it("removes a legacy email-keyed twin when the uid is resolved", async () => {
    store.set("users/me/blocked/seller@example.com", { blockedUid: "seller@example.com", blockedEmail: "seller@example.com" });
    await saveBlockedUser(db, "me", "seller@example.com");
    expect(store.has("users/me/blocked/seller@example.com")).toBe(false);
    expect(store.has("users/me/blocked/uidSELLER0123456789abcd")).toBe(true);
  });

  it("falls back to an email-keyed doc when the uid cannot be resolved (inbox filter keeps working)", async () => {
    lookupResult = null;
    const res = await saveBlockedUser(db, "me", "ghost@example.com");
    expect(res).toEqual({ id: "ghost@example.com", uidResolved: false });
    expect(store.get("users/me/blocked/ghost@example.com")).toMatchObject({ blockedEmail: "ghost@example.com" });
    expect(Object.values(store.get("users/me/blocked/ghost@example.com") || {})).not.toContain(undefined);
  });

  it("a failing lookup does not break blocking", async () => {
    lookupThrows = true;
    expect(await resolveBlockedUid("x@example.com")).toBe("");
    const res = await saveBlockedUser(db, "me", "x@example.com");
    expect(res.id).toBe("x@example.com");
  });

  it("uses a known uid without any lookup (seller page) and tolerates an unknown email without writing undefined", async () => {
    await saveBlockedUser(db, "me", "", "sellerUidKnown");
    expect(lookups).toEqual([]);
    const data = store.get("users/me/blocked/sellerUidKnown") as Doc;
    expect(data.blockedUid).toBe("sellerUidKnown");
    expect("blockedEmail" in data).toBe(false);
    expect(Object.values(data)).not.toContain(undefined);
  });

  it("throws when there is neither uid nor email", async () => {
    lookupResult = null;
    await expect(saveBlockedUser(db, "me", "")).rejects.toThrow();
  });
});

describe("reading blocks: write and read keys agree", () => {
  it("the inbox/unread filter (blockedEmailsFromDocs) still sees a uid-keyed block via blockedEmail", () => {
    const { data } = buildBlockedDoc({ uid: "uid1", email: "Seller@Example.com" });
    expect(blockedEmailsFromDocs([{ data: () => data }])).toEqual(["seller@example.com"]);
  });

  it("seller-page lookup finds the uid-keyed doc", async () => {
    await saveBlockedUser(db, "me", "seller@example.com");
    expect(await findBlockedDocIds(db, "me", { uid: "uidSELLER0123456789abcd", email: "seller@example.com" })).toEqual([
      "uidSELLER0123456789abcd",
    ]);
  });

  it("seller-page lookup also finds a legacy email-keyed doc (saved before the fix) and unblock removes it", async () => {
    store.set("users/me/blocked/seller@example.com", { blockedUid: "seller@example.com", blockedEmail: "seller@example.com" });
    const ids = await findBlockedDocIds(db, "me", { uid: "uidSELLER0123456789abcd", email: "Seller@example.com" });
    expect(ids).toEqual(["seller@example.com"]);
    await removeBlockedDocs(db, "me", ids);
    expect(store.size).toBe(0);
  });

  it("reports not blocked when nothing matches; email-less target only checks the uid doc", async () => {
    expect(await findBlockedDocIds(db, "me", { uid: "uidX", email: "a@b.co" })).toEqual([]);
    expect(await findBlockedDocIds(db, "me", { uid: "uidX" })).toEqual([]);
    expect(touchedCollections).toHaveLength(1);
  });
});

describe("source guards", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("messages + blocked pages no longer query profiles by email and use saveBlockedUser", () => {
    for (const f of ["app/messages/page.tsx", "app/blocked/page.tsx"]) {
      const src = read(f);
      expect(src).not.toMatch(/collection\(db, "profiles"\), where\("email"/);
      expect(src).toContain("saveBlockedUser(");
    }
  });
  it("seller page no longer writes blockedEmail: profile?.email (always undefined on the public profile)", () => {
    const src = read("app/seller/[username]/page.tsx");
    expect(src).not.toContain("blockedEmail: profile?.email");
    expect(src).toContain("findBlockedDocIds(");
    expect(src).toContain("removeBlockedDocs(");
  });
});
