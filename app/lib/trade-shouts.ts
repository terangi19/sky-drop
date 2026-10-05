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
