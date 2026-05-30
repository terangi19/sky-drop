"use client";

import { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { showToast } from "../components/Toast";

export default function BlockedPage() {
  const [user, setUser] = useState<User | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<{ uid: string; email: string }[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  // Live snapshot of blocked users
  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const q = query(collection(db, "users", user.uid, "blocked"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        uid: d.id,
        email: (d.data().blockedEmail as string) || d.id,
      }));
      setBlockedUsers(items);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  async function blockUser() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { showToast("Enter an email.", "error"); return; }
    if (blockedUsers.some((b) => b.email === cleanEmail)) { showToast("User already blocked.", "info"); return; }

    // Look up the user's UID by email
    let uid = cleanEmail;
    try {
      const snap = await getDocs(query(collection(db, "profiles"), where("email", "==", cleanEmail)));
      if (!snap.empty) uid = snap.docs[0].id;
    } catch {}

    const ref = doc(db, "users", user!.uid, "blocked", uid);
    await setDoc(ref, { blockedUid: uid, blockedEmail: cleanEmail, createdAt: Timestamp.now() });
    setEmail("");
  }

  async function unblockUser(uid: string) {
    await deleteDoc(doc(db, "users", user!.uid, "blocked", uid));
  }

  async function clearAll() {
    for (const b of blockedUsers) {
      try { await deleteDoc(doc(db, "users", user!.uid, "blocked", b.uid)); } catch {}
    }
    setClearConfirm(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return blockedUsers;
    const q = search.toLowerCase();
    return blockedUsers.filter((b) => b.email.toLowerCase().includes(q));
  }, [blockedUsers, search]);

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-900/60 border border-zinc-800/50 animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar />
        <div className="relative z-10 flex flex-col items-center justify-center py-40">
          <p className="text-xl text-[var(--muted)]">Log in to manage blocked users.</p>
          <Link href="/login" className="mt-6 rounded-xl bg-sky-500 px-8 py-3 font-bold text-[var(--foreground)] hover:bg-sky-400">Log In</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>

        <h1 className="text-2xl font-black text-[var(--foreground)]">Blocked Users</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Blocked users can't message you or interact with your listings.</p>

        {/* Add block */}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Block a user</p>
          <div className="mt-3 flex gap-2">
            <input
              type="email" placeholder="Enter email address..."
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500 placeholder:text-[var(--muted)]"
            />
            <button onClick={blockUser}
              className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-bold text-[var(--foreground)] hover:bg-red-400">
              Block
            </button>
          </div>
        </div>

        {/* Blocked list */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Blocked ({blockedUsers.length})</p>
            <div className="flex items-center gap-2">
              <input
                type="text" placeholder="Search blocked..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs outline-none focus:border-sky-500 w-48"
              />
              {blockedUsers.length > 0 && (
                <button onClick={() => setClearConfirm(true)}
                  className="rounded-lg border border-red-500/20 px-3 py-1.5 text-[10px] font-bold text-red-400 transition hover:bg-red-500/10">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
              <p className="text-2xl mb-2">🛡️</p>
              <p className="text-sm text-[var(--muted)]">{blockedUsers.length === 0 ? "No blocked users yet." : "No results match your search."}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((b) => (
                <div key={b.uid} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700">
                  <div className="min-w-0 flex-1">
                    <Link href={`/seller/${b.email}`} className="truncate text-sm font-bold text-[var(--foreground)] hover:text-sky-400 transition-colors">
                      {b.email}
                    </Link>
                    <p className="text-[10px] text-[var(--muted)]">Synced across all devices</p>
                  </div>
                  <button onClick={() => unblockUser(b.uid)}
                    className="shrink-0 rounded-lg border border-red-500/30 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/10">
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setClearConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Unblock all users?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This will unblock all {blockedUsers.length} users.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={clearAll} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Unblock All</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
