"use client";

import { auth } from "./firebase";
import { replaceWithLoginRedirect } from "./use-require-auth";
import { watchlistAccountUid } from "./watchlist-account-gate";

/**
 * Watchlist mutations belong to a signed-in account.
 * Guests are sent to login with a return URL; callers must not toast success
 * or fill the heart when this returns null.
 */
export function requireWatchlistAccount(
  user?: { uid?: string } | null
): string | null {
  const uid = watchlistAccountUid(user, auth.currentUser);
  if (uid) return uid;
  replaceWithLoginRedirect();
  return null;
}
