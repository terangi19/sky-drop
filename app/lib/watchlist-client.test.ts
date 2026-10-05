import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  showToast: vi.fn(),
  adjust: vi.fn(async () => undefined),
  orderBy: vi.fn(),
  limit: vi.fn((n: number) => ({ __limit: n })),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ __path: path.join("/") }),
  doc: (_db: unknown, ...path: string[]) => ({ __path: path.join("/") }),
  query: (...parts: unknown[]) => ({ __query: parts }),
  limit: h.limit,
  orderBy: h.orderBy,
  getDocs: h.getDocs,
  getDoc: h.getDoc,
  setDoc: h.setDoc,
  deleteDoc: h.deleteDoc,
}));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("../components/Toast", () => ({ showToast: h.showToast }));
vi.mock("./listing-watchlist-count", () => ({ adjustListingWatchlistCount: h.adjust }));

import { hydrateWatchlistCache, setListingWatchlistSaved } from "./watchlist-client";
import { readWatchlistIds } from "./watchlist-cache";

function stubLocalStorage(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { ...seed };
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  });
  return data;
}

const snapOf = (ids: string[]) => ({ docs: ids.map((id) => ({ id })) });
const item = { id: "L1", title: "Lamp", price: 40 };

beforeEach(() => {
  vi.unstubAllGlobals();
  Object.values(h).forEach((m) => "mockClear" in m && (m as ReturnType<typeof vi.fn>).mockClear());
  h.getDocs.mockReset();
  h.getDoc.mockReset();
  h.setDoc.mockClear();
  h.deleteDoc.mockClear();
});

describe("hydrateWatchlistCache", () => {
  it("fills the per-uid cache from Firestore, purges the legacy key, caps at WATCHLIST_LIMIT, no orderBy", async () => {
    const data = stubLocalStorage({ watchlist: JSON.stringify([{ id: "someone-elses" }]) });
    h.getDocs.mockResolvedValueOnce(snapOf(["a", "b"]));
    await expect(hydrateWatchlistCache("u1")).resolves.toBe(true);
    expect(readWatchlistIds("u1")).toEqual(["a", "b"]);
    expect(data["watchlist"]).toBeUndefined();
    expect(h.limit).toHaveBeenCalledWith(100);
    expect(h.orderBy).not.toHaveBeenCalled(); // docs without savedAt must still count
  });

  it("is skipped within the TTL (cost guard) unless forced", async () => {
    stubLocalStorage();
    h.getDocs.mockResolvedValue(snapOf(["a"]));
    await hydrateWatchlistCache("u1");
    await expect(hydrateWatchlistCache("u1")).resolves.toBe(false);
    expect(h.getDocs).toHaveBeenCalledTimes(1);
    await hydrateWatchlistCache("u1", { force: true });
    expect(h.getDocs).toHaveBeenCalledTimes(2);
  });

  it("de-dupes concurrent hydrates into one read", async () => {
    stubLocalStorage();
    let release!: (v: unknown) => void;
    h.getDocs.mockReturnValueOnce(new Promise((r) => (release = r)));
    const p1 = hydrateWatchlistCache("u9");
    const p2 = hydrateWatchlistCache("u9");
    release(snapOf(["x"]));
    await Promise.all([p1, p2]);
    expect(h.getDocs).toHaveBeenCalledTimes(1);
  });

  it("a read failure leaves the cache alone and does not throw", async () => {
    stubLocalStorage({ watchlist_u2: JSON.stringify(["keep"]) });
    h.getDocs.mockRejectedValueOnce(new Error("offline"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(hydrateWatchlistCache("u2")).resolves.toBe(false);
    spy.mockRestore();
    expect(readWatchlistIds("u2")).toEqual(["keep"]);
  });

  it("a toggle that lands mid-fetch wins over the stale snapshot", async () => {
    stubLocalStorage();
    let release!: (v: unknown) => void;
    h.getDocs.mockReturnValueOnce(new Promise((r) => (release = r)));
    h.getDoc.mockResolvedValueOnce({ exists: () => false });
    const hydrating = hydrateWatchlistCache("u3");
    await setListingWatchlistSaved({ uid: "u3", item, save: true, ownerEmail: "u3@x.nz" });
    release(snapOf([])); // snapshot taken before the save
    await expect(hydrating).resolves.toBe(false);
    expect(readWatchlistIds("u3")).toEqual(["L1"]);
  });
});

describe("setListingWatchlistSaved", () => {
  it("save: checks Firestore first, writes account doc + index doc (with userEmail), +1 once, toasts Added", async () => {
    stubLocalStorage();
    h.getDoc.mockResolvedValueOnce({ exists: () => false });
    const res = await setListingWatchlistSaved({ uid: "u1", item, save: true, ownerEmail: "me@x.nz" });
    expect(res).toEqual({ ok: true, saved: true, changed: true });
    const paths = h.setDoc.mock.calls.map((c) => (c as unknown[])[0] as { __path: string });
    expect(paths.map((p) => p.__path)).toEqual(["users/u1/watchlist/L1", "watchlist/u1_L1"]);
    const indexData = (h.setDoc.mock.calls[1] as unknown[])[1] as Record<string, unknown>;
    expect(indexData).toMatchObject({ userId: "u1", userEmail: "me@x.nz", listingId: "L1" });
    expect(h.adjust).toHaveBeenCalledTimes(1);
    expect(h.adjust).toHaveBeenCalledWith("L1", 1);
    expect(h.showToast).toHaveBeenCalledWith("Added to watchlist!", "success");
  });

  it("save on a fresh device when the doc already exists: no writes, no count bump, 'Already in watchlist'", async () => {
    stubLocalStorage();
    h.getDoc.mockResolvedValueOnce({ exists: () => true });
    const res = await setListingWatchlistSaved({ uid: "u1", item, save: true, ownerEmail: "me@x.nz" });
    expect(res).toEqual({ ok: true, saved: true, changed: false });
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(h.deleteDoc).not.toHaveBeenCalled();
    expect(h.adjust).not.toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith("Already in watchlist", "info");
    expect(readWatchlistIds("u1")).toEqual(["L1"]);
  });

  it("a rejected index-doc write does not fail the save", async () => {
    stubLocalStorage();
    h.getDoc.mockResolvedValueOnce({ exists: () => false });
    h.setDoc.mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error("permission-denied") as never);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setListingWatchlistSaved({ uid: "u1", item, save: true, ownerEmail: "" });
    spy.mockRestore();
    expect(res).toEqual({ ok: true, saved: true, changed: true });
  });

  it("remove: deletes both docs, -1 once, a missing index doc is swallowed", async () => {
    stubLocalStorage({ watchlist_u1: JSON.stringify(["L1"]) });
    h.getDoc.mockResolvedValueOnce({ exists: () => true });
    h.deleteDoc.mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error("permission-denied") as never);
    const res = await setListingWatchlistSaved({ uid: "u1", item, save: false });
    expect(res).toEqual({ ok: true, saved: false, changed: true });
    expect(h.deleteDoc).toHaveBeenCalledTimes(2);
    expect(h.adjust).toHaveBeenCalledWith("L1", -1);
    expect(h.showToast).toHaveBeenCalledWith("Removed from watchlist", "info");
    expect(readWatchlistIds("u1")).toEqual([]);
  });

  it("failures toast an error and leave count + cache alone", async () => {
    stubLocalStorage();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.getDoc.mockRejectedValueOnce(new Error("offline"));
    expect(await setListingWatchlistSaved({ uid: "u1", item, save: true })).toEqual({ ok: false, error: "read" });
    expect(h.showToast).toHaveBeenLastCalledWith("Failed to save to watchlist", "error");
    h.getDoc.mockResolvedValueOnce({ exists: () => true });
    h.deleteDoc.mockRejectedValueOnce(new Error("denied") as never);
    expect(await setListingWatchlistSaved({ uid: "u1", item, save: false })).toEqual({ ok: false, error: "write" });
    expect(h.showToast).toHaveBeenLastCalledWith("Could not remove from watchlist", "error");
    spy.mockRestore();
    expect(h.adjust).not.toHaveBeenCalled();
  });
});
