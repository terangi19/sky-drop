import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
  showToast: vi.fn(),
  adjust: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ __path: path.join("/") }),
  doc: (_db: unknown, ...path: string[]) => ({ __path: path.join("/") }),
  query: (...parts: unknown[]) => ({ __query: parts }),
  limit: (n: number) => ({ __limit: n }),
  getDocs: vi.fn(),
  getDoc: h.getDoc,
  setDoc: h.setDoc,
  deleteDoc: h.deleteDoc,
}));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("../components/Toast", () => ({ showToast: h.showToast }));
vi.mock("./listing-watchlist-count", () => ({ adjustListingWatchlistCount: h.adjust }));

import { setListingWatchlistSaved } from "./watchlist-client";
import {
  WATCHLIST_HYDRATE_TTL_MS,
  isInWatchlistCache,
  readWatchlistIds,
  type WatchlistStorage,
} from "./watchlist-cache";
import { setWatchlistSaved, type WatchlistRemote } from "./watchlist-sync";

function memoryStorage(seed: Record<string, string> = {}): WatchlistStorage {
  const data: Record<string, string> = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const item = { id: "L1", title: "Desk lamp", price: 40 };

beforeEach(() => {
  vi.unstubAllGlobals();
  Object.values(h).forEach((m) => m.mockClear());
  h.getDoc.mockReset();
  h.setDoc.mockReset().mockResolvedValue(undefined as never);
  h.deleteDoc.mockReset().mockResolvedValue(undefined as never);
});

describe("setWatchlistSaved: optimistic heart", () => {
  it("flips the heart (cache) and fires onOptimistic before any network round trip; count waits for the write", async () => {
    const st = memoryStorage();
    const read = deferred<boolean>();
    const remote: WatchlistRemote = { exists: vi.fn(() => read.promise), add: vi.fn(async () => {}), remove: vi.fn() };
    const adjustCount = vi.fn();
    const onOptimistic = vi.fn();
    const pending = setWatchlistSaved({ remote, adjustCount, storage: st, onOptimistic }, { uid: "u1", item, save: true });
    expect(isInWatchlistCache("u1", "L1", st)).toBe(true); // painted already
    expect(onOptimistic).toHaveBeenCalledWith(true);
    expect(adjustCount).not.toHaveBeenCalled(); // no count bump until Firestore confirms
    read.resolve(false);
    expect(await pending).toEqual({ ok: true, saved: true, changed: true });
    expect(adjustCount).toHaveBeenCalledTimes(1);
  });

  it("a failed write reverts the heart and calls onRevert; count untouched", async () => {
    const st = memoryStorage();
    const remote: WatchlistRemote = {
      exists: vi.fn(async () => false),
      add: vi.fn(async () => {
        throw new Error("permission-denied");
      }),
      remove: vi.fn(),
    };
    const adjustCount = vi.fn();
    const onRevert = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setWatchlistSaved({ remote, adjustCount, storage: st, onRevert }, { uid: "u1", item, save: true });
    spy.mockRestore();
    expect(res).toEqual({ ok: false, error: "write" });
    expect(isInWatchlistCache("u1", "L1", st)).toBe(false);
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(adjustCount).not.toHaveBeenCalled();
  });

  it("a failed read on REMOVE puts the heart back to saved", async () => {
    const st = memoryStorage({ watchlist_u1: JSON.stringify(["L1"]) });
    const remote: WatchlistRemote = {
      exists: vi.fn(async () => {
        throw new Error("offline");
      }),
      add: vi.fn(),
      remove: vi.fn(),
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = setWatchlistSaved({ remote, adjustCount: vi.fn(), storage: st }, { uid: "u1", item, save: false });
    expect(isInWatchlistCache("u1", "L1", st)).toBe(false); // optimistic empty heart
    expect(await pending).toEqual({ ok: false, error: "read" });
    spy.mockRestore();
    expect(isInWatchlistCache("u1", "L1", st)).toBe(true);
  });

  it("fast double click: remote phases are serialised, count goes +1 then -1, final state consistent", async () => {
    const st = memoryStorage();
    const docs = new Set<string>();
    const calls: string[] = [];
    const remote: WatchlistRemote = {
      exists: vi.fn(async (uid, id) => {
        calls.push("exists");
        await new Promise((r) => setTimeout(r, 5));
        return docs.has(`${uid}/${id}`);
      }),
      add: vi.fn(async (uid, it) => {
        calls.push("add");
        docs.add(`${uid}/${it.id}`);
      }),
      remove: vi.fn(async (uid, id) => {
        calls.push("remove");
        docs.delete(`${uid}/${id}`);
      }),
    };
    const adjustCount = vi.fn();
    const deps = { remote, adjustCount, storage: st };
    const a = setWatchlistSaved(deps, { uid: "u1", item, save: true });
    const b = setWatchlistSaved(deps, { uid: "u1", item, save: false });
    expect(isInWatchlistCache("u1", "L1", st)).toBe(false); // second click already painted
    await Promise.all([a, b]);
    expect(calls).toEqual(["exists", "add", "exists", "remove"]);
    expect(adjustCount.mock.calls).toEqual([["L1", 1], ["L1", -1]]);
    expect(docs.size).toBe(0);
    expect(readWatchlistIds("u1", st)).toEqual([]);
  });
});

describe("setListingWatchlistSaved (client): toast + heart before Firestore", () => {
  function stubLocalStorage() {
    const st = memoryStorage();
    vi.stubGlobal("localStorage", st);
    return st;
  }

  it("shows 'Added to watchlist!' and paints the heart while getDoc is still pending", async () => {
    stubLocalStorage();
    const read = deferred<{ exists: () => boolean }>();
    h.getDoc.mockReturnValueOnce(read.promise);
    const pending = setListingWatchlistSaved({ uid: "u1", item, save: true, ownerEmail: "me@x.nz" });
    expect(h.showToast).toHaveBeenCalledWith("Added to watchlist!", "success");
    expect(readWatchlistIds("u1")).toEqual(["L1"]);
    expect(h.setDoc).not.toHaveBeenCalled();
    read.resolve({ exists: () => false });
    expect(await pending).toEqual({ ok: true, saved: true, changed: true });
    expect(h.setDoc).toHaveBeenCalledTimes(2); // account doc + price-alert index doc, unchanged
    expect(h.adjust).toHaveBeenCalledTimes(1);
  });

  it("on failure: error toast and the heart flips back", async () => {
    stubLocalStorage();
    h.getDoc.mockResolvedValueOnce({ exists: () => false });
    h.setDoc.mockRejectedValueOnce(new Error("permission-denied") as never);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setListingWatchlistSaved({ uid: "u1", item, save: true });
    spy.mockRestore();
    expect(res).toEqual({ ok: false, error: "write" });
    expect(h.showToast.mock.calls.map((c) => c[0])).toEqual(["Added to watchlist!", "Failed to save to watchlist"]);
    expect(readWatchlistIds("u1")).toEqual([]);
    expect(h.adjust).not.toHaveBeenCalled();
  });

  it("keeps the 5-minute per-uid hydrate TTL", () => {
    expect(WATCHLIST_HYDRATE_TTL_MS).toBe(5 * 60 * 1000);
  });
});
