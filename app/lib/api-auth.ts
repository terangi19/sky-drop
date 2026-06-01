import { auth } from "./firebase";

/** Fresh Firebase ID token for server API calls (forces refresh if expired). */
export async function getFreshIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(true);
  } catch (e) {
    console.error("[getFreshIdToken]", e);
    return null;
  }
}
