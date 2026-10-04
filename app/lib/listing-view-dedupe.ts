const PREFIX = "sd:lv:";

/** True if this tab session already counted a view for the listing. Storage errors fail open (count the view). */
export function hasCountedListingView(listingId: string, storage: Pick<Storage, "getItem"> | null = safeSession()): boolean {
  if (!storage || !listingId) return false;
  try {
    return storage.getItem(PREFIX + listingId) === "1";
  } catch {
    return false;
  }
}

export function markListingViewCounted(listingId: string, storage: Pick<Storage, "setItem"> | null = safeSession()): void {
  if (!storage || !listingId) return;
  try {
    storage.setItem(PREFIX + listingId, "1");
  } catch {
    /* quota / private mode: ignore */
  }
}

/**
 * Schedule ONE view POST for `listingId` after `delayMs` (default 3s), deduped per tab session.
 * Returns a cancel function for effect cleanup.
 *
 * The page keys its effect on `[listingId]` only. Keying it on user/listing state (as the old
 * combined effect did) cancels the pending timer whenever auth or the listing finishes loading
 * inside the delay window, and the per-mount guard then never reschedules it, so the view is lost.
 * Nothing here reads or writes Firestore: the only backend work per counted view is the
 * single `increment(1)` write inside `send`'s route.
 */
export function scheduleListingView(
  listingId: string,
  send: (listingId: string) => void,
  delayMs = 3000,
  storage: Pick<Storage, "getItem" | "setItem"> | null = safeSession()
): () => void {
  if (!listingId) return () => {};
  const timer = setTimeout(() => {
    if (hasCountedListingView(listingId, storage)) return;
    markListingViewCounted(listingId, storage);
    send(listingId);
  }, delayMs);
  return () => clearTimeout(timer);
}

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
