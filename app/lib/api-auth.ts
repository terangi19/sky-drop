import { auth } from "./firebase";
import { waitForAuthReady } from "./auth-session";

/** Fresh Firebase ID token for server API calls (forces refresh if expired). */
export async function getFreshIdToken(): Promise<string | null> {
  // Wait for IndexedDB/local restore after refresh before treating user as signed out.
  const restored = await waitForAuthReady();
  const user = auth.currentUser || restored;
  if (!user) return null;
  try {
    return await user.getIdToken(true);
  } catch (e) {
    console.error("[getFreshIdToken]", e);
    return null;
  }
}
