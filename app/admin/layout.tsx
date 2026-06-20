"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import Background from "../components/Background";
import Navbar from "../components/Navbar";
import ThemeToggle from "../components/ThemeToggle";

async function setAdminSession(token: string) {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {}
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const verifyGen = useRef(0);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const ADMIN_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setVerified(false);
      return;
    }

    const gen = ++verifyGen.current;
    setVerified(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        await setAdminSession(token);
        const res = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (gen !== verifyGen.current) return;
        setVerified(data.isAdmin === true);
      } catch {
        if (gen !== verifyGen.current) return;
        setVerified(false);
      }
    })();
  }, [user, authReady]);

  // Admin session timeout - sign out after 30 minutes of inactivity
  useEffect(() => {
    if (!verified) {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }
      return;
    }

    const resetTimeout = () => {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      activityTimeoutRef.current = setTimeout(() => {
        auth.signOut();
        window.location.href = "/admin";
      }, ADMIN_SESSION_TIMEOUT_MS);
    };

    // Track user activity
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(event => {
      window.addEventListener(event, resetTimeout);
    });

    resetTimeout(); // Start timer on mount

    return () => {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetTimeout);
      });
    };
  }, [verified]);

  const checking = !authReady || (user !== null && verified === null);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Checking...</p>
      </main>
    );
  }

  if (!user || !verified) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <ThemeToggle />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">🔒</div>
            <h1 className="text-5xl font-black text-red-500">Access Denied</h1>
            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
              {!user ? (
                <>Please <Link href="/login?redirect=/admin" className="text-sky-400 hover:underline">sign in</Link> with an admin account.</>
              ) : (
                <>Account <strong>{user.email}</strong> is not authorized.</>
              )}
            </p>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
