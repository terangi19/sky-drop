import { auth } from "./firebase";

/** Normalize listing watchlist save count from Firestore. */
export function listingWatchlistCount(
  item: Record<string, unknown> | null | undefined
): number {
  if (!item) return 0;
  const v = item.watchlistCount;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") return Math.max(0, parseInt(v, 10) || 0);
  return 0;
}

/** 0–1 intensity for watchlist-based card glow (caps around ~20 saves). */
export function listingWatchlistGlowIntensity(count: number): number {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return 0;
  return Math.min(1, Math.log10(n + 1) / Math.log10(21));
}

/** Bump public watchlist counter on a listing (authenticated API only). */
export async function adjustListingWatchlistCount(
  listingId: string,
  delta: 1 | -1
): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/listing-watchlist-count", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ listingId, delta }),
    });
    if (!res.ok) {
      console.error("adjustListingWatchlistCount failed:", res.status);
    }
  } catch (e) {
    console.error("adjustListingWatchlistCount failed:", e);
  }
}
