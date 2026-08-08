/**
 * Dev-only lightweight network / Firestore call counters.
 * No-op in production builds (NODE_ENV !== "development").
 *
 * In the browser console:
 *   __skyNetStats()        → current counts
 *   __skyNetStats.reset()  → zero counters
 *   __skyNetStats.log()    → console.info snapshot
 */

export type DevRequestStatKey = "fetch" | "getDoc" | "getDocs" | "onSnapshot";

type Stats = Record<DevRequestStatKey, number> & { startedAt: number };

const isDev = process.env.NODE_ENV === "development";

const stats: Stats = {
  fetch: 0,
  getDoc: 0,
  getDocs: 0,
  onSnapshot: 0,
  startedAt: 0,
};

export function bumpDevRequestStat(key: DevRequestStatKey): void {
  if (!isDev) return;
  stats[key] += 1;
}

export function getDevRequestStats(): Readonly<Stats> {
  return { ...stats };
}

export function resetDevRequestStats(): void {
  stats.fetch = 0;
  stats.getDoc = 0;
  stats.getDocs = 0;
  stats.onSnapshot = 0;
  stats.startedAt = Date.now();
}

/** Install fetch monkey-patch + window helpers. Safe to call multiple times. */
export function installDevRequestInstrumentation(): void {
  if (!isDev || typeof window === "undefined") return;
  const w = window as Window & {
    __skyNetStatsInstalled?: boolean;
    __skyNetStats?: (() => Stats) & { reset: () => void; log: () => void };
  };
  if (w.__skyNetStatsInstalled) return;
  w.__skyNetStatsInstalled = true;
  if (!stats.startedAt) stats.startedAt = Date.now();

  const origFetch = window.fetch.bind(window);
  window.fetch = ((...args: Parameters<typeof fetch>) => {
    bumpDevRequestStat("fetch");
    return origFetch(...args);
  }) as typeof fetch;

  const api = Object.assign(() => getDevRequestStats(), {
    reset: resetDevRequestStats,
    log: () => {
      // eslint-disable-next-line no-console
      console.info("[sky-net]", getDevRequestStats());
    },
  });
  w.__skyNetStats = api;
}
