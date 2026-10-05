/**
 * Per-account localStorage CACHE of saved listing ids.
 *
 * Firestore (`users/{uid}/watchlist/{listingId}`) is the source of truth; this
 * cache only makes hearts paint instantly. It is keyed per uid so one account's
 * hearts can never show for another account on the same browser. Pure module:
 * no Firebase import, storage is injectable for tests.
 */

/** Pre-fix, un-scoped key. Owner unknown, so it is never read - only purged. */
export const LEGACY_WATCHLIST_KEY = "watchlist";

/** How long a hydrate from Firestore is trusted (limits homepage reads). */
export const WATCHLIST_HYDRATE_TTL_MS = 5 * 60 * 1000;

export type WatchlistStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function watchlistCacheKey(uid: string): string {
  return `watchlist_${uid}`;
}

export function watchlistHydratedAtKey(uid: string): string {
  return `watchlist_hydrated_at_${uid}`;
}

function defaultStorage(): WatchlistStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Accepts `string[]` (search's old format) or `{ id }[]`; drops junk and dupes. */
export function parseWatchlistIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const entry of parsed) {
      const id =
        typeof entry === "string"
          ? entry
          : entry && typeof (entry as { id?: unknown }).id === "string"
            ? (entry as { id: string }).id
            : "";
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export function readWatchlistIds(
  uid: string | null | undefined,
  storage: WatchlistStorage | null = defaultStorage()
): string[] {
  if (!uid || !storage) return [];
  try {
    return parseWatchlistIds(storage.getItem(watchlistCacheKey(uid)));
  } catch {
    return [];
  }
}

export function writeWatchlistIds(
  uid: string | null | undefined,
  ids: string[],
  storage: WatchlistStorage | null = defaultStorage()
): void {
  if (!uid || !storage) return;
  try {
    storage.setItem(watchlistCacheKey(uid), JSON.stringify(Array.from(new Set(ids.filter(Boolean)))));
  } catch {
    /* quota / private mode: the cache is optional */
  }
}

/** Guests (no uid) are never "saved". */
export function isInWatchlistCache(
  uid: string | null | undefined,
  listingId: string,
  storage: WatchlistStorage | null = defaultStorage()
): boolean {
  if (!uid || !listingId) return false;
  return readWatchlistIds(uid, storage).includes(listingId);
}

export function addToWatchlistCache(
  uid: string | null | undefined,
  listingId: string,
  storage: WatchlistStorage | null = defaultStorage()
): void {
  if (!uid || !listingId) return;
  const ids = readWatchlistIds(uid, storage);
  if (!ids.includes(listingId)) writeWatchlistIds(uid, [listingId, ...ids], storage);
}

export function removeFromWatchlistCache(
  uid: string | null | undefined,
  listingId: string,
  storage: WatchlistStorage | null = defaultStorage()
): void {
  if (!uid || !listingId) return;
  const ids = readWatchlistIds(uid, storage);
  if (ids.includes(listingId)) writeWatchlistIds(uid, ids.filter((id) => id !== listingId), storage);
}

/**
 * The old un-scoped `watchlist` key held full listing objects for whichever
 * account touched the browser last. We cannot tell whose it is, so it is NOT
 * migrated: it is dropped (Firestore re-hydrates the per-uid cache).
 */
export function purgeLegacyWatchlistKey(storage: WatchlistStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_WATCHLIST_KEY);
  } catch {
    /* ignore */
  }
}

export function isWatchlistHydrateFresh(
  uid: string,
  now: number = Date.now(),
  storage: WatchlistStorage | null = defaultStorage()
): boolean {
  if (!storage) return false;
  try {
    const at = Number(storage.getItem(watchlistHydratedAtKey(uid)));
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < WATCHLIST_HYDRATE_TTL_MS;
  } catch {
    return false;
  }
}

export function markWatchlistHydrated(
  uid: string,
  now: number = Date.now(),
  storage: WatchlistStorage | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(watchlistHydratedAtKey(uid), String(now));
  } catch {
    /* ignore */
  }
}
