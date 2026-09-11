/**
 * Cheap Firestore refresh for views that do not need live listeners.
 * Pauses while the tab is hidden; refetches when it becomes visible again.
 * Visibility refetches are skipped when a fetch started recently (tab-switch churn).
 * `dedupeAsync` shares in-flight work and a short TTL across remounts / Strict Mode.
 */
export const BROWSE_POLL_MS = 60_000;
export const DETAIL_POLL_MS = 30_000;
/** Skip visibility-triggered refetch when a fetch started this recently. */
export const VISIBILITY_REFETCH_MIN_MS = 15_000;
/** Remount / Strict Mode / quick back-navigation — still shorter than browse poll. */
export const BROWSE_SWR_TTL_MS = 15_000;
/** Homepage poll is 5 minutes; cache covers tab switches and remounts. */
export const HOME_SWR_TTL_MS = 60_000;

type CacheEntry<T> = { data: T; at: number };

const swrCache = new Map<string, CacheEntry<unknown>>();
const swrInflight = new Map<string, Promise<unknown>>();

export function resetDedupeForTests(): void {
  swrCache.clear();
  swrInflight.clear();
}

/**
 * Module-level SWR: one in-flight promise per key, plus a short TTL cache.
 * Callers still `setState` with the result so remounts paint immediately
 * without a second Firestore round-trip.
 */
export async function dedupeAsync<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  force = false
): Promise<T> {
  if (!force) {
    const cached = swrCache.get(key) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.at < ttlMs) {
      return cached.data;
    }
  }

  const pending = swrInflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = fetcher()
    .then((data) => {
      swrCache.set(key, { data, at: Date.now() });
      return data;
    })
    .finally(() => {
      if (swrInflight.get(key) === p) swrInflight.delete(key);
    });
  swrInflight.set(key, p);
  return p;
}

export function startVisibilityPolledFetch(
  fetchFn: () => void | Promise<void>,
  intervalMs: number
): () => void {
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let lastStartedAt = 0;
  const minVisibleMs = Math.min(intervalMs, VISIBILITY_REFETCH_MIN_MS);

  const run = (fromVisibility = false) => {
    if (stopped) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (inFlight) return;
    if (
      fromVisibility &&
      lastStartedAt > 0 &&
      Date.now() - lastStartedAt < minVisibleMs
    ) {
      return;
    }
    lastStartedAt = Date.now();
    inFlight = Promise.resolve(fetchFn())
      .catch((err) => {
        console.error("[polled-fetch]", err);
      })
      .finally(() => {
        inFlight = null;
      });
  };

  run(false);
  const interval = setInterval(() => run(false), intervalMs);
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      run(true);
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    stopped = true;
    clearInterval(interval);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
