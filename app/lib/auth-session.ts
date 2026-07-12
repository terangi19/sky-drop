import type { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "./firebase";

let authReadyPromise: Promise<User | null> | null = null;

/** Resolves once Firebase has restored (or confirmed absent) the persisted session. */
export function waitForAuthReady(): Promise<User | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user);
      });
    });
  }

  return authReadyPromise;
}

export function resetAuthReadyCache(): void {
  authReadyPromise = null;
}
