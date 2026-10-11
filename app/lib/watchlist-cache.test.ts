import { describe, expect, it } from "vitest";
import {
  LEGACY_WATCHLIST_KEY,
  WATCHLIST_HYDRATE_TTL_MS,
  addToWatchlistCache,
  isInWatchlistCache,
  isWatchlistHydrateFresh,
  markWatchlistHydrated,
  parseWatchlistIds,
  purgeLegacyWatchlistKey,
  readWatchlistIds,
  removeFromWatchlistCache,
  watchlistCacheKey,
  writeWatchlistIds,
  type WatchlistStorage,
} from "./watchlist-cache";

function memoryStorage(seed: Record<string, string> = {}): WatchlistStorage & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  };
}

describe("watchlist per-uid cache", () => {
  it("keys the cache per uid (same key search already used)", () => {
    expect(watchlistCacheKey("u1")).toBe("watchlist_u1");
    expect(LEGACY_WATCHLIST_KEY).toBe("watchlist");
  });

  it("never shows another account's hearts on the same browser", () => {
    const st = memoryStorage();
    addToWatchlistCache("userA", "listing-1", st);
    expect(isInWatchlistCache("userA", "listing-1", st)).toBe(true);
    expect(isInWatchlistCache("userB", "listing-1", st)).toBe(false);
    expect(readWatchlistIds("userB", st)).toEqual([]);
  });

  it("ignores the legacy un-scoped key for reads and purges it", () => {
    const st = memoryStorage({ [LEGACY_WATCHLIST_KEY]: JSON.stringify([{ id: "listing-1", sellerEmail: "x@y.z" }]) });
    expect(isInWatchlistCache("userA", "listing-1", st)).toBe(false);
    purgeLegacyWatchlistKey(st);
    expect(st.data[LEGACY_WATCHLIST_KEY]).toBeUndefined();
  });

  it("guests (no uid) are never saved and never write", () => {
    const st = memoryStorage();
    addToWatchlistCache(null, "listing-1", st);
    addToWatchlistCache(undefined, "listing-1", st);
    expect(isInWatchlistCache(null, "listing-1", st)).toBe(false);
    expect(Object.keys(st.data)).toEqual([]);
  });

  it("parses search's string[] format and {id}[] objects, dropping junk and dupes", () => {
    expect(parseWatchlistIds(JSON.stringify(["a", "b", "a"]))).toEqual(["a", "b"]);
    expect(parseWatchlistIds(JSON.stringify([{ id: "a" }, { id: 5 }, null, "b", ""]))).toEqual(["a", "b"]);
    expect(parseWatchlistIds("not json")).toEqual([]);
    expect(parseWatchlistIds('{"id":"a"}')).toEqual([]);
    expect(parseWatchlistIds(null)).toEqual([]);
  });

  it("add / remove are idempotent", () => {
    const st = memoryStorage();
    addToWatchlistCache("u", "a", st);
    addToWatchlistCache("u", "a", st);
    addToWatchlistCache("u", "b", st);
    expect(readWatchlistIds("u", st)).toEqual(["b", "a"]);
    removeFromWatchlistCache("u", "a", st);
    removeFromWatchlistCache("u", "a", st);
    expect(readWatchlistIds("u", st)).toEqual(["b"]);
    writeWatchlistIds("u", ["x", "x", "y"], st);
    expect(readWatchlistIds("u", st)).toEqual(["x", "y"]);
  });

  it("hydrate stamp is per uid and expires after the TTL", () => {
    const st = memoryStorage();
    expect(isWatchlistHydrateFresh("u", 1_000, st)).toBe(false);
    markWatchlistHydrated("u", 1_000, st);
    expect(isWatchlistHydrateFresh("u", 1_000 + WATCHLIST_HYDRATE_TTL_MS - 1, st)).toBe(true);
    expect(isWatchlistHydrateFresh("u", 1_000 + WATCHLIST_HYDRATE_TTL_MS, st)).toBe(false);
    expect(isWatchlistHydrateFresh("other", 1_001, st)).toBe(false);
  });

  it("missing storage (SSR / blocked) degrades to empty, no throw", () => {
    expect(readWatchlistIds("u", null)).toEqual([]);
    expect(() => addToWatchlistCache("u", "a", null)).not.toThrow();
    expect(isWatchlistHydrateFresh("u", 1, null)).toBe(false);
    const throwing: WatchlistStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(readWatchlistIds("u", throwing)).toEqual([]);
    expect(() => writeWatchlistIds("u", ["a"], throwing)).not.toThrow();
    expect(() => purgeLegacyWatchlistKey(throwing)).not.toThrow();
  });
});
