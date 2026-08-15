"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { resetAuthReadyCache } from "../lib/auth-session";
import { subscribeAuthBroadcast } from "../lib/auth-broadcast";

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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    const unsubscribeBroadcast = subscribeAuthBroadcast((message) => {
      if (message.type === "signed-out") {
        setUser(null);
        setLoading(false);
        resetAuthReadyCache();
      }
    });
    return () => {
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
