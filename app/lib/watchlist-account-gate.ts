import { loginRedirectHref } from "./safe-redirect";

/** Account uid that may persist a watchlist entry, if any. */
export function watchlistAccountUid(
  user: { uid?: string } | null | undefined,
  currentUser?: { uid?: string } | null
): string | null {
  const uid = user?.uid || currentUser?.uid;
  return uid || null;
}

/** Login URL so a guest watchlist click returns to the listing surface. */
export function guestWatchlistLoginHref(returnPath: string): string {
  return loginRedirectHref(returnPath);
}

/**
 * Guest watchlist clicks must never claim a save.
 * Success toast / filled heart are only for an authenticated account persist.
 */
export function unauthenticatedWatchlistClickResult(): {
  allow: false;
  persistToAccount: false;
  showSuccessToast: false;
  fillHeart: false;
  redirectToLogin: true;
} {
  return {
    allow: false,
    persistToAccount: false,
    showSuccessToast: false,
    fillHeart: false,
    redirectToLogin: true,
  };
}

/** Heart is "saved" only when the viewer has an account and the id is on their list. */
export function watchlistHeartIsSaved(
  accountUid: string | null | undefined,
  listingId: string,
  localWatchlistIds: string[]
): boolean {
  if (!accountUid || !listingId) return false;
  return localWatchlistIds.includes(listingId);
}

export function canPersistWatchlistToAccount(
  accountUid: string | null | undefined
): boolean {
  return Boolean(accountUid);
}
