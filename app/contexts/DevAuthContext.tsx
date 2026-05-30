"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { User } from "firebase/auth";
import { getMockUser, setMockUser, clearMockUser, isDevAuthEnabled, restoreMockUser } from "../lib/dev-auth";

interface DevAuthContextType {
  user: User | null;
  loading: boolean;
  loginAs: (email: string) => void;
  logout: () => void;
}

const DevAuthContext = createContext<DevAuthContextType>({
  user: null,
  loading: true,
  loginAs: () => {},
  logout: () => {},
});

export function DevAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isDevAuthEnabled()) { setLoading(false); return; }
    const restored = restoreMockUser();
    if (restored) {
      const mock = getMockUser()!;
      setUser({
        uid: mock.uid,
        email: mock.email,
        emailVerified: mock.emailVerified,
        getIdToken: async () => createFakeToken(mock),
        toJSON: () => ({}),
      } as unknown as User);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isDevAuthEnabled()) return;
    const onAuth = () => {
      const mock = getMockUser();
      if (mock) {
        setUser({
          uid: mock.uid,
          email: mock.email,
          emailVerified: mock.emailVerified,
          getIdToken: async () => createFakeToken(mock),
          toJSON: () => ({}),
        } as unknown as User);
      } else {
        setUser(null);
      }
    };
    window.addEventListener("dev-auth-change", onAuth);
    return () => window.removeEventListener("dev-auth-change", onAuth);
  }, []);

  function loginAs(email: string) {
    const mock = setMockUser(email);
    const fakeUser = {
      uid: mock.uid,
      email: mock.email,
      emailVerified: mock.emailVerified,
      getIdToken: async () => createFakeToken(mock),
      toJSON: () => ({}),
    } as unknown as User;
    setUser(fakeUser);
    window.dispatchEvent(new Event("dev-auth-change"));
  }

  function logout() {
    clearMockUser();
    setUser(null);
    window.dispatchEvent(new Event("dev-auth-change"));
  }

  return (
    <DevAuthContext.Provider value={{ user, loading, loginAs, logout }}>
      {children}
    </DevAuthContext.Provider>
  );
}

export function useDevAuth() {
  return useContext(DevAuthContext);
}

function createFakeToken(user: { uid: string; email: string; emailVerified: boolean }): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub: user.uid,
      email: user.email,
      email_verified: user.emailVerified,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: "sky-drop-dev",
      iss: "https://securetoken.google.com/sky-drop-dev",
    })
  );
  return `${header}.${payload}.fake_signature_for_dev`;
}
