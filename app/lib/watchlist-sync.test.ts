import { describe, expect, it, vi } from "vitest";
import { isInWatchlistCache, readWatchlistIds, type WatchlistStorage } from "./watchlist-cache";
import {
  buildWatchlistAccountDoc,
  buildWatchlistIndexDoc,
  setWatchlistSaved,
  type WatchlistRemote,
} from "./watchlist-sync";

function memoryStorage(): WatchlistStorage {
  const data: Record<string, string> = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** In-memory "Firestore": the set of `${uid}/${id}` account docs. */
function fakeRemote(initial: string[] = []) {
  const docs = new Set(initial);
  const remote: WatchlistRemote = {
    exists: vi.fn(async (uid, id) => docs.has(`${uid}/${id}`)),
    add: vi.fn(async (uid, item) => {
      docs.add(`${uid}/${item.id}`);
    }),
    remove: vi.fn(async (uid, id) => {
      docs.delete(`${uid}/${id}`);
    }),
  };
  return { remote, docs };
}

const item = { id: "L1", title: "Desk lamp", price: 40, imageUrl: "http://img/1.jpg" };

describe("setWatchlistSaved - Firestore is the source of truth", () => {
  it("fresh device: heart empty but the item is already saved -> first click does NOT re-add or bump the count", async () => {
    const st = memoryStorage();
    const { remote } = fakeRemote(["u1/L1"]);
    const adjustCount = vi.fn();
    expect(isInWatchlistCache("u1", "L1", st)).toBe(false); // empty cache on this device
    const res = await setWatchlistSaved({ remote, adjustCount, storage: st }, { uid: "u1", item, save: true });
    expect(res).toEqual({ ok: true, saved: true, changed: false });
    expect(remote.add).not.toHaveBeenCalled();
    expect(remote.remove).not.toHaveBeenCalled(); // no delete-then-re-add churn (it reset savedPrice/savedAt)
    expect(adjustCount).not.toHaveBeenCalled();
    expect(isInWatchlistCache("u1", "L1", st)).toBe(true); // cache healed
  });

  it("saving an unsaved item adds once and bumps the count once", async () => {
    const st = memoryStorage();
    const { remote, docs } = fakeRemote();
    const adjustCount = vi.fn();
    const deps = { remote, adjustCount, storage: st };
    expect(await setWatchlistSaved(deps, { uid: "u1", item, save: true })).toEqual({ ok: true, saved: true, changed: true });
    // double-click / second tab: second save is a no-op
    expect(await setWatchlistSaved(deps, { uid: "u1", item, save: true })).toEqual({ ok: true, saved: true, changed: false });
    expect(remote.add).toHaveBeenCalledTimes(1);
    expect(adjustCount).toHaveBeenCalledTimes(1);
    expect(adjustCount).toHaveBeenCalledWith("L1", 1);
    expect(docs.has("u1/L1")).toBe(true);
  });

  it("removing a saved item deletes once and decrements once; removing an unsaved one is a no-op", async () => {
    const st = memoryStorage();
    const { remote } = fakeRemote(["u1/L1"]);
    const adjustCount = vi.fn();
    const deps = { remote, adjustCount, storage: st };
    expect(await setWatchlistSaved(deps, { uid: "u1", item, save: false })).toEqual({ ok: true, saved: false, changed: true });
    expect(await setWatchlistSaved(deps, { uid: "u1", item, save: false })).toEqual({ ok: true, saved: false, changed: false });
    expect(remote.remove).toHaveBeenCalledTimes(1);
    expect(adjustCount).toHaveBeenCalledTimes(1);
    expect(adjustCount).toHaveBeenCalledWith("L1", -1);
  });

  it("stale 'saved' cache but nothing in Firestore: remove only heals the cache (no -1)", async () => {
    const st = memoryStorage();
    st.setItem("watchlist_u1", JSON.stringify(["L1"]));
    const { remote } = fakeRemote();
    const adjustCount = vi.fn();
    const res = await setWatchlistSaved({ remote, adjustCount, storage: st }, { uid: "u1", item, save: false });
    expect(res).toEqual({ ok: true, saved: false, changed: false });
    expect(adjustCount).not.toHaveBeenCalled();
    expect(readWatchlistIds("u1", st)).toEqual([]);
  });

  it("a failed existence read changes nothing", async () => {
    const st = memoryStorage();
    const { remote } = fakeRemote();
    (remote.exists as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    const adjustCount = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setWatchlistSaved({ remote, adjustCount, storage: st }, { uid: "u1", item, save: true });
    spy.mockRestore();
    expect(res).toEqual({ ok: false, error: "read" });
    expect(remote.add).not.toHaveBeenCalled();
    expect(adjustCount).not.toHaveBeenCalled();
    expect(readWatchlistIds("u1", st)).toEqual([]);
  });

  it("a failed write does not touch the cache or the count", async () => {
    const st = memoryStorage();
    const { remote } = fakeRemote();
    (remote.add as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("permission-denied"));
    const adjustCount = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await setWatchlistSaved({ remote, adjustCount, storage: st }, { uid: "u1", item, save: true });
    spy.mockRestore();
    expect(res).toEqual({ ok: false, error: "write" });
    expect(adjustCount).not.toHaveBeenCalled();
    expect(readWatchlistIds("u1", st)).toEqual([]);
  });

  it("two accounts on one browser keep separate hearts", async () => {
    const st = memoryStorage();
    const { remote } = fakeRemote();
    const deps = { remote, adjustCount: vi.fn(), storage: st };
    await setWatchlistSaved(deps, { uid: "A", item, save: true });
    expect(isInWatchlistCache("A", "L1", st)).toBe(true);
    expect(isInWatchlistCache("B", "L1", st)).toBe(false);
    // B's click is judged against B's Firestore doc, not A's heart
    const res = await setWatchlistSaved(deps, { uid: "B", item, save: true });
    expect(res).toEqual({ ok: true, saved: true, changed: true });
  });
});

describe("watchlist doc shapes", () => {
  const now = "2026-10-05T00:00:00.000Z";

  it("account doc is the superset every surface used to write", () => {
    const d = buildWatchlistAccountDoc(
      { id: "L1", title: "Lamp", price: 40, images: ["i0.jpg"], sellerEmail: "s@x.nz", sellerUsername: "sam", sellerId: "S1" },
      now
    );
    expect(d).toEqual({
      id: "L1",
      listingId: "L1",
      title: "Lamp",
      price: 40,
      imageUrl: "i0.jpg",
      savedPrice: 40,
      savedAt: now,
      sellerEmail: "s@x.nz",
      sellerUsername: "sam",
      sellerId: "S1",
    });
  });

  it("index doc carries userId + userEmail as firestore.rules require, and listingId for price-drop fan-out", () => {
    const d = buildWatchlistIndexDoc("u1", item, "me@x.nz", now);
    expect(d.userId).toBe("u1");
    expect(d.userEmail).toBe("me@x.nz");
    expect(d.listingId).toBe("L1");
    expect(d.savedPrice).toBe(40);
  });

  it("never emits undefined fields (Firestore rejects them)", () => {
    const d = buildWatchlistIndexDoc("u1", { id: "L2" }, undefined, now);
    expect(Object.values(d).some((v) => v === undefined)).toBe(false);
    expect(d.userEmail).toBe("");
    expect(d.title).toBe("");
  });
});
