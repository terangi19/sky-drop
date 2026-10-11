import {
  addToWatchlistCache,
  isInWatchlistCache,
  removeFromWatchlistCache,
  type WatchlistStorage,
} from "./watchlist-cache";

/**
 * Watchlist save/remove orchestration. Firestore is the source of truth:
 * every action first asks the remote whether the account already has the
 * entry, so a stale/empty local cache can never cause a double add, a
 * delete-then-re-add churn (which reset `savedPrice`/`savedAt`), or a second
 * `watchlistCount` bump. Pure: remote + counter are injected.
 *
 * The HEART is optimistic: the per-uid cache flips (and `onOptimistic` fires, so the
 * caller can repaint + toast) before any network round trip; the Firestore check and
 * writes run afterwards and a failure restores the previous cache state (`onRevert`).
 * The displayed watchlistCount still moves only on a confirmed write (`changed`), so
 * it can never double-bump. Remote phases for the same uid+listing run one after the
 * other, so a fast double click cannot interleave exists()/add()/remove().
 */

export type WatchlistItemInput = {
  id: string;
  title?: unknown;
  price?: unknown;
  imageUrl?: unknown;
  image?: unknown;
  images?: unknown;
  sellerEmail?: unknown;
  sellerUsername?: unknown;
  sellerId?: unknown;
};

export interface WatchlistRemote {
  /** `users/{uid}/watchlist/{id}` exists. Throws on read failure. */
  exists(uid: string, id: string): Promise<boolean>;
  /** Create the account doc (must succeed) + price-alert index doc (best effort). */
  add(uid: string, item: WatchlistItemInput, ownerEmail?: string | null): Promise<void>;
  /** Delete the account doc (must succeed) + price-alert index doc (best effort). */
  remove(uid: string, id: string): Promise<void>;
}

export type SetWatchlistSavedResult =
  | { ok: true; saved: boolean; changed: boolean }
  | { ok: false; error: "read" | "write" };

function firstString(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v) return v;
  return "";
}

/** Shape written to `users/{uid}/watchlist/{id}` (superset of every old surface). */
export function buildWatchlistAccountDoc(item: WatchlistItemInput, now: string) {
  const images = Array.isArray(item.images) ? (item.images as unknown[]) : [];
  return {
    id: item.id,
    listingId: item.id,
    title: typeof item.title === "string" ? item.title : "",
    price: item.price ?? "",
    imageUrl: firstString(item.imageUrl, item.image, images[0]),
    savedPrice: item.price ?? "",
    savedAt: now,
    sellerEmail: firstString(item.sellerEmail),
    sellerUsername: firstString(item.sellerUsername),
    sellerId: firstString(item.sellerId),
  };
}

/**
 * Shape written to the top-level `watchlist/{uid}_{id}` price-drop index.
 * firestore.rules requires userId == auth.uid AND userEmail == token.email.
 */
export function buildWatchlistIndexDoc(
  uid: string,
  item: WatchlistItemInput,
  ownerEmail: string | null | undefined,
  now: string
) {
  return {
    ...buildWatchlistAccountDoc(item, now),
    userId: uid,
    userEmail: ownerEmail || "",
  };
}

export type SetWatchlistSavedDeps = {
  remote: WatchlistRemote;
  /** Fire-and-forget server counter (itself idempotent per uid). */
  adjustCount: (listingId: string, delta: 1 | -1) => void | Promise<void>;
  storage?: WatchlistStorage | null;
  /** Fired synchronously right after the optimistic cache flip, before any network call. */
  onOptimistic?: (save: boolean) => void;
  /** Fired after a failed read/write restored the cache to its pre-click state. */
  onRevert?: () => void;
};

/** Per uid+listing chain of remote phases (see header). */
const remoteChains = new Map<string, Promise<unknown>>();

/**
 * Make the account's saved state for `item` equal `save`.
 * The cache (heart) flips immediately; the returned promise settles after Firestore.
 * `changed` is true only when Firestore was actually written - callers bump the
 * displayed watchlistCount only then.
 */
export function setWatchlistSaved(
  deps: SetWatchlistSavedDeps,
  args: { uid: string; item: WatchlistItemInput; save: boolean; ownerEmail?: string | null }
): Promise<SetWatchlistSavedResult> {
  const { uid, item, save } = args;
  const { storage } = deps;
  const wasCached = isInWatchlistCache(uid, item.id, storage);
  if (save) addToWatchlistCache(uid, item.id, storage);
  else removeFromWatchlistCache(uid, item.id, storage);
  deps.onOptimistic?.(save);

  const key = `${uid}\u0000${item.id}`;
  const previous = remoteChains.get(key) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => syncWatchlistRemote(deps, args, wasCached));
  remoteChains.set(key, run);
  void run
    .catch(() => undefined)
    .finally(() => {
      if (remoteChains.get(key) === run) remoteChains.delete(key);
    });
  return run;
}

async function syncWatchlistRemote(
  deps: SetWatchlistSavedDeps,
  args: { uid: string; item: WatchlistItemInput; save: boolean; ownerEmail?: string | null },
  wasCached: boolean
): Promise<SetWatchlistSavedResult> {
  const { uid, item, save, ownerEmail } = args;
  const { remote, adjustCount, storage } = deps;
  const revert = () => {
    if (wasCached) addToWatchlistCache(uid, item.id, storage);
    else removeFromWatchlistCache(uid, item.id, storage);
    deps.onRevert?.();
  };

  let exists: boolean;
  try {
    exists = await remote.exists(uid, item.id);
  } catch (e) {
    console.error("watchlist exists check failed:", e);
    revert();
    return { ok: false, error: "read" };
  }

  if (save) {
    if (exists) {
      addToWatchlistCache(uid, item.id, storage);
      return { ok: true, saved: true, changed: false };
    }
    try {
      await remote.add(uid, item, ownerEmail);
    } catch (e) {
      console.error("watchlist add failed:", e);
      revert();
      return { ok: false, error: "write" };
    }
    addToWatchlistCache(uid, item.id, storage);
    void adjustCount(item.id, 1);
    return { ok: true, saved: true, changed: true };
  }

  if (!exists) {
    removeFromWatchlistCache(uid, item.id, storage);
    return { ok: true, saved: false, changed: false };
  }
  try {
    await remote.remove(uid, item.id);
  } catch (e) {
    console.error("watchlist remove failed:", e);
    revert();
    return { ok: false, error: "write" };
  }
  removeFromWatchlistCache(uid, item.id, storage);
  void adjustCount(item.id, -1);
  return { ok: true, saved: false, changed: true };
}
