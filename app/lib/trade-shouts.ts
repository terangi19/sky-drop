/**
 * Pure helpers for the trade-feed shoutbox (app/trade-feed/page.tsx).
 *
 * `tradeShouts.createdAt` is written by /api/create-trade-shout as FieldValue.serverTimestamp(),
 * i.e. a Firestore Timestamp, so every time comparison must go through a millisecond conversion.
 * (Comparing a Timestamp with a plain number, as the old auto-clear did, never matches.)
 */

/** Newest shouts shown per world. Query is `where(world ==) orderBy(createdAt desc) limit(...)`. */
export const TRADE_SHOUT_LIMIT = 30;

/** Shouts older than this are auto-cleared (comment on the effect says "older than 1 hour"). */
export const TRADE_SHOUT_TTL_MS = 60 * 60 * 1000;

/** Milliseconds for a Firestore Timestamp (or timestamp-like / Date); 0 when unknown or pending. */
export function shoutCreatedMs(createdAt: unknown): number {
  if (!createdAt || typeof createdAt !== "object") return 0;
  const t = createdAt as { toMillis?: () => number; seconds?: unknown; nanoseconds?: unknown };
  if (typeof t.toMillis === "function") {
    const ms = t.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (createdAt instanceof Date) return createdAt.getTime() || 0;
  if (typeof t.seconds === "number" && Number.isFinite(t.seconds)) {
    return t.seconds * 1000 + (typeof t.nanoseconds === "number" ? Math.floor(t.nanoseconds / 1e6) : 0);
  }
  return 0;
}

/** Oldest first (chat order). Input order (the query returns newest first) is not mutated. */
export function orderShoutsOldestFirst<T extends object>(items: readonly T[]): T[] {
  const ms = (item: T) => shoutCreatedMs((item as { createdAt?: unknown }).createdAt);
  return [...items].sort((a, b) => ms(a) - ms(b));
}

/**
 * Ids of shouts the signed-in user may delete and that are past the TTL.
 * firestore.rules only allow `delete` when `resource.data.by == request.auth.token.email`,
 * so only the author's own shouts are ever returned (one foreign doc would fail a whole batch).
 */
export function expiredOwnShoutIds(
  shouts: ReadonlyArray<{ id: string; by?: unknown; createdAt?: unknown }>,
  ownerEmail: string | null | undefined,
  nowMs: number,
  ttlMs: number = TRADE_SHOUT_TTL_MS
): string[] {
  if (!ownerEmail) return [];
  return shouts
    .filter((s) => {
      if (s.by !== ownerEmail) return false;
      const created = shoutCreatedMs(s.createdAt);
      return created > 0 && nowMs - created > ttlMs;
    })
    .map((s) => s.id);
}

/**
 * Display filter: hide shouts older than the TTL. Server-side cleanup (daily cron) can leave expired
 * shouts in Firestore for up to ~26h, and the client auto-clear only deletes the viewer's OWN shouts,
 * so without this other people's day-old shouts stay on screen. Shouts with an unknown/pending
 * createdAt (0) are kept (a just-sent shout before the server timestamp resolves).
 */
export function visibleShouts<T extends { createdAt?: unknown }>(
  items: readonly T[],
  nowMs: number,
  ttlMs: number = TRADE_SHOUT_TTL_MS
): T[] {
  return items.filter((s) => {
    const created = shoutCreatedMs(s.createdAt);
    return created === 0 || nowMs - created <= ttlMs;
  });
}

/**
 * onSnapshot error handler for the shout listener. A missing composite index
 * (`failed-precondition`) or a rules denial (`permission-denied`) would otherwise fail silently
 * (Firestore logs nothing useful without an error callback). Logs once per error code per
 * handler instance (the listener does not retry, so no spam), and reports via `onError` so the UI can
 * show a quiet empty state while keeping any shouts it already has.
 */
export function createShoutListenerErrorHandler(
  onError: (code: string) => void,
  log: (...args: unknown[]) => void = console.warn
): (err: unknown) => void {
  const seen = new Set<string>();
  return (err: unknown) => {
    const code = String((err as { code?: unknown } | null)?.code || "unknown");
    if (!seen.has(code)) {
      seen.add(code);
      const message = String((err as { message?: unknown } | null)?.message || err);
      log(`[trade-feed] shout listener failed (${code}):`, message);
    }
    onError(code);
  };
}
