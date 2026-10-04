/**
 * Marketplace listing counts must not present an unknown/unloaded state as "0".
 *
 * Two common races:
 * 1. Client state starts as `[]` / `0` before the first fetch resolves.
 * 2. A cached empty QuerySnapshot (onSnapshot's first emit, or getDocs while
 *    offline) is not a real zero — wait for a server result or a non-empty cache.
 */

export type ListingSnapshotLike = {
  size: number;
  metadata: { fromCache: boolean };
};

/**
 * Whether a query snapshot is safe to treat as the real listing count / empty state.
 * Cached empty is not authoritative — wait for the server (or a non-empty cache).
 */
export function isAuthoritativeListingSnapshot(snap: ListingSnapshotLike): boolean {
  if (snap.metadata.fromCache && snap.size === 0) return false;
  return true;
}

/**
 * Numeric listing count for marketplace UI.
 * Returns `null` while the count is unknown so callers do not render "0 listings".
 * A genuine 0 is returned only after loading has settled.
 * During a refresh, `previousKnownCount` is kept instead of flashing empty.
 */
export function resolvedMarketplaceListingCount(input: {
  loading: boolean;
  count: number;
  previousKnownCount?: number | null;
}): number | null {
  if (!input.loading) return input.count;
  if (input.previousKnownCount != null) return input.previousKnownCount;
  return null;
}

export function formatMarketplaceListingCount(
  count: number | null,
  labels: { singular?: string; plural?: string } = {}
): string | null {
  if (count == null) return null;
  const singular = labels.singular ?? "listing";
  const plural = labels.plural ?? "listings";
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * True when a recorded count sequence showed 0 and then a later positive
 * number — the homepage / Cars flash this change is meant to prevent.
 */
export function listingCountSequenceFlashedZero(
  log: Array<string | number | null | undefined>
): boolean {
  const values = log.map((v) => (v == null ? null : String(v)));
  const idx0 = values.indexOf("0");
  if (idx0 === -1) return false;
  return values
    .slice(idx0 + 1)
    .some((v) => v != null && /^\d+$/.test(v) && Number(v) > 0);
}
