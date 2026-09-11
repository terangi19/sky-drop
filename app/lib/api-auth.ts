import { auth } from "./firebase";
import { waitForAuthReady } from "./auth-session";

/**
 * Firebase ID token for server API calls.
 * Uses the cached token (Firebase refreshes it when expired). Pass true only
 * after a 401 — forcing refresh on every request adds 50–200ms of network.
 */
export async function getFreshIdToken(forceRefresh = false): Promise<string | null> {
  // Wait for IndexedDB/local restore after refresh before treating user as signed out.
  const restored = await waitForAuthReady();
  const user = auth.currentUser || restored;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (e) {
    console.error("[getFreshIdToken]", e);
    return null;
  }
}

/** fetch() with Bearer token; retries once after a forced refresh on 401. */
export async function fetchWithIdToken(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getFreshIdToken(false);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status !== 401) return res;
  const retried = await getFreshIdToken(true);
  if (!retried) return res;
  headers.set("Authorization", `Bearer ${retried}`);
  return fetch(input, { ...init, headers });
}
