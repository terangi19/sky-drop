"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { showToast } from "../components/Toast";
import { WATCHLIST_LIMIT } from "./firestore-query-limits";
import { adjustListingWatchlistCount } from "./listing-watchlist-count";
import {
  isWatchlistHydrateFresh,
  markWatchlistHydrated,
  purgeLegacyWatchlistKey,
  readWatchlistIds,
  writeWatchlistIds,
} from "./watchlist-cache";
import {
  buildWatchlistAccountDoc,
  buildWatchlistIndexDoc,
  setWatchlistSaved,
  type SetWatchlistSavedResult,
  type WatchlistItemInput,
  type WatchlistRemote,
} from "./watchlist-sync";

/**
 * Single client entry point for the listing watchlist (every surface uses it).
 * Firestore `users/{uid}/watchlist/{id}` is the source of truth; the per-uid
 * localStorage cache only paints hearts. Callers keep their own guest gate
 * (`requireWatchlistAccount`) and pass the resulting uid.
 */

export const firestoreWatchlistRemote: WatchlistRemote = {
  async exists(uid, id) {
    const snap = await getDoc(doc(db, "users", uid, "watchlist", id));
    return snap.exists();
  },
  async add(uid, item, ownerEmail) {
    const now = new Date().toISOString();
    await setDoc(doc(db, "users", uid, "watchlist", item.id), buildWatchlistAccountDoc(item, now));
    // Price-drop alert index: best effort (rules need userEmail == token.email).
    try {
      await setDoc(
        doc(db, "watchlist", `${uid}_${item.id}`),
        buildWatchlistIndexDoc(uid, item, ownerEmail, now)
      );
    } catch (e) {
      console.error("Watchlist index save failed:", e);
    }
  },
  async remove(uid, id) {
    await deleteDoc(doc(db, "users", uid, "watchlist", id));
    // The index doc may not exist (rules deny deleting a missing doc): best effort.
    try {
      await deleteDoc(doc(db, "watchlist", `${uid}_${id}`));
    } catch {
      /* ignore */
    }
  },
};

const listeners = new Set<() => void>();
let mutationVersion = 0;

function notifyWatchlistChanged() {
  mutationVersion += 1;
  listeners.forEach((fn) => fn());
}

/**
 * Save (`save: true`) or remove an item for `uid`, toast the outcome, and
 * re-render every mounted heart. `changed` tells the caller whether to adjust a
 * displayed watchlistCount (never on "Already in watchlist").
 */
export async function setListingWatchlistSaved(args: {
  uid: string;
  item: WatchlistItemInput;
  save: boolean;
  ownerEmail?: string | null;
}): Promise<SetWatchlistSavedResult> {
  const result = await setWatchlistSaved(
    { remote: firestoreWatchlistRemote, adjustCount: adjustListingWatchlistCount },
    args
  );
  if (!result.ok) {
    showToast(args.save ? "Failed to save to watchlist" : "Could not remove from watchlist", "error");
    return result;
  }
  if (result.saved) {
    showToast(result.changed ? "Added to watchlist!" : "Already in watchlist", result.changed ? "success" : "info");
  } else {
    showToast("Removed from watchlist", "info");
  }
  notifyWatchlistChanged();
  return result;
}

const inflight = new Map<string, Promise<boolean>>();

/**
 * Refresh the per-uid cache from Firestore (at most once per TTL per browser
 * session; shared across components). Resolves true when the cache changed.
 * A local toggle that lands mid-fetch wins: the stale snapshot is dropped.
 */
export function hydrateWatchlistCache(uid: string, opts?: { force?: boolean }): Promise<boolean> {
  purgeLegacyWatchlistKey();
  if (!opts?.force && isWatchlistHydrateFresh(uid)) return Promise.resolve(false);
  const pending = inflight.get(uid);
  if (pending) return pending;
  const startedAt = mutationVersion;
  const run = (async () => {
    // No orderBy: docs without `savedAt` must still count as saved. Same cap as /watchlist.
    const snap = await getDocs(query(collection(db, "users", uid, "watchlist"), limit(WATCHLIST_LIMIT)));
    if (mutationVersion !== startedAt) return false;
    writeWatchlistIds(uid, snap.docs.map((d) => d.id));
    markWatchlistHydrated(uid);
    return true;
  })()
    .catch((e) => {
      console.error("watchlist hydrate failed:", e);
      return false;
    })
    .finally(() => {
      inflight.delete(uid);
    });
  inflight.set(uid, run);
  return run;
}

/**
 * Heart-state reader for a surface: `isSaved(id)` is false for guests, reads the
 * per-uid cache, and changes identity whenever the cache is hydrated or toggled
 * so memo'd cards re-render. Triggers one Firestore hydrate per TTL.
 */
export function useWatchlistSaved(uid: string | null | undefined): (id: string) => boolean {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void hydrateWatchlistCache(uid).then((changed) => {
      if (changed && !cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // One parse per (uid, version) instead of one per card per render.
  const savedIds = useMemo(() => {
    void version;
    return new Set(readWatchlistIds(uid));
  }, [uid, version]);

  return useCallback((id: string) => Boolean(uid) && savedIds.has(id), [uid, savedIds]);
}
