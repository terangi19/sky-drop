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

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
