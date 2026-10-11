"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { resetAuthReadyCache } from "../lib/auth-session";
import { subscribeAuthBroadcast } from "../lib/auth-broadcast";
import { bindListingDraftOwner } from "../lib/sky-ai-draft-owner";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session restore can stall when IndexedDB is blocked or slow. Stop blocking
    // the UI after a short wait; the listener below still applies the real user.
    const restoreTimeout = window.setTimeout(() => setLoading(false), 3000);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      window.clearTimeout(restoreTimeout);
      // Scope the tab-wide Sky AI listing draft to this account (clears it on sign-out / account switch).
      bindListingDraftOwner(currentUser?.uid ?? null);
      setUser(currentUser);
      setLoading(false);
    });
    const unsubscribeBroadcast = subscribeAuthBroadcast((message) => {
      if (message.type === "signed-out") {
        bindListingDraftOwner(null);
        setUser(null);
        setLoading(false);
        resetAuthReadyCache();
      }
    });
    return () => {
      window.clearTimeout(restoreTimeout);
      unsubscribe();
      unsubscribeBroadcast();
      resetAuthReadyCache();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
