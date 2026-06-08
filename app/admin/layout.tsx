"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import Background from "../components/Background";
import Navbar from "../components/Navbar";
import ThemeToggle from "../components/ThemeToggle";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";

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
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken().then(async (token) => {
      await setAdminSession(token);
      try {
        const res = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!cancelled) setVerified(data.isAdmin === true);
      } catch {
        if (!cancelled) setVerified(false);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  if (verified === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Checking...</p>
      </main>
    );
  }

  if (!verified) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <ThemeToggle />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">🔒</div>
            <h1 className="text-5xl font-black text-red-500">Access Denied</h1>
            <AwhinaUnderHeader centered className="mt-4" />
            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
              You do not have permission to access the admin dashboard.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
