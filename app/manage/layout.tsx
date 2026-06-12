"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import ManageShell from "../components/manage/ManageShell";

async function setAdminSession(token: string) {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  } catch {
    /* optional — verify uses Bearer token directly */
  }
}

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const verifyGen = useRef(0);

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

  const checking = !authReady || (user !== null && verified === null);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Checking access...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="max-w-md rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-[var(--foreground)]">Sign in required</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Log in with an admin account to open the control center.</p>
          <Link href="/login?redirect=/manage" className="mt-4 inline-block text-sm text-sky-400 hover:underline">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  if (!verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
        <div className="max-w-md rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-[var(--foreground)]">Access Denied</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Signed in as <span className="text-[var(--foreground)]">{user.email}</span> — this account is not an admin.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-sky-400 hover:underline">
            &larr; Back to marketplace
          </Link>
        </div>
      </main>
    );
  }

  return <ManageShell>{children}</ManageShell>;
}
