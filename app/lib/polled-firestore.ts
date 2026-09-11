/**
 * Cheap Firestore refresh for views that do not need live listeners.
 * Pauses while the tab is hidden; refetches when it becomes visible again.
 */
export const BROWSE_POLL_MS = 60_000;
export const DETAIL_POLL_MS = 30_000;
/** Seller/admin dashboards, orders, disputes — not chat. */
export const DASHBOARD_POLL_MS = 30_000;

export function startVisibilityPolledFetch(
  fetchFn: () => void | Promise<void>,
  intervalMs: number
): () => void {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const run = () => {
    if (stopped) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    if (inFlight) return;
    inFlight = Promise.resolve(fetchFn())
      .catch((err) => {
        console.error("[polled-fetch]", err);
      })
      .finally(() => {
        inFlight = null;
      });
  };

  run();
  const interval = setInterval(run, intervalMs);
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      run();
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
