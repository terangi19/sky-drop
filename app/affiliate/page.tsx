"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";

const COMMISSION_RATE = 0.05;

interface Commission {
  id: string;
  referrerEmail: string;
  referredEmail: string;
  purchaseId: string;
  listingId: string;
  listingTitle: string;
  amount: number;
  status: "pending" | "paid";
  createdAt: Timestamp;
}

interface ReferralEvent {
  id: string;
  type: "signup" | "commission";
  referrerEmail: string;
  referredEmail?: string;
  amount?: number;
  listingTitle?: string;
  createdAt: Timestamp;
}

export default function AffiliatePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [events, setEvents] = useState<ReferralEvent[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "profiles", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (!data.referralCode) {
          const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          setProfile({ ...data, referralCode: newCode });
          updateDoc(doc(db, "profiles", user.uid), { referralCode: newCode }).catch(() => {});
        } else {
          setProfile(data);
        }
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(
      collection(db, "commissions"),
      where("referrerEmail", "==", user.email),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Commission));
      setCommissions(items);
    }, (err) => console.error("Failed to load commissions:", err));
    return () => unsub();
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(
      collection(db, "referralEvents"),
      where("referrerEmail", "==", user.email),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReferralEvent));
      setEvents(items);
    }, (err) => console.error("Failed to load referral events:", err));
    return () => unsub();
  }, [user?.email]);

  const referralCode = profile?.referralCode || "";
  const signups = profile?.referralSignups || 0;
  const commissionBalance = profile?.commissionBalance || 0;
  const totalCommissionEarned = profile?.totalCommissionEarned || 0;
  const pendingCommissions = commissions.filter((c) => c.status === "pending").length;
  const shareLink = `${typeof window !== "undefined" ? window.location.origin : "https://sky-drop.vercel.app"}/login?ref=${referralCode}`;

  if (!authChecked) return null;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(245,158,11,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/15 bg-amber-500/5 px-3.5 py-1 text-[10px] font-semibold text-amber-400 mb-4 tracking-wide uppercase">Affiliate Program</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Earn with Referrals</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Share your referral code and earn {COMMISSION_RATE * 100}% commission on every purchase made by people you refer.
            </p>
          </div>
        </div>

        {!user ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🔗</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">Sign in to view your affiliate dashboard</h2>
            <Link href="/login" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/30 hover:scale-105 active:scale-95">
              Sign In
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Referral Code Card */}
            <div className="rounded-2xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-6 sm:p-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-4">Your Referral Code</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 text-lg font-bold tracking-wider text-amber-400 select-all text-center sm:text-left">
                  {referralCode || "—"}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(referralCode); }}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl hover:shadow-amber-500/30 active:scale-95"
                >
                  Copy Code
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)] break-all">
                Share link:{" "}
                <span className="text-amber-400 select-all">{shareLink}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(shareLink); }}
                  className="ml-2 text-[10px] text-sky-400 hover:text-sky-300 transition"
                >
                  Copy
                </button>
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-5 text-center">
                <p className="text-2xl font-black text-amber-400">{signups}</p>
                <p className="mt-1 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Referrals</p>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-5 text-center">
                <p className="text-2xl font-black text-amber-400">{pendingCommissions}</p>
                <p className="mt-1 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Pending</p>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-5 text-center">
                <p className="text-2xl font-black text-emerald-400">${totalCommissionEarned.toFixed(2)}</p>
                <p className="mt-1 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Total Earned</p>
              </div>
              <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-5 text-center">
                <p className="text-2xl font-black text-sky-400">${commissionBalance.toFixed(2)}</p>
                <p className="mt-1 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Balance</p>
              </div>
            </div>

            {/* How it Works */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-5">How It Works</h2>
              <div className="grid sm:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-xl">1️⃣</div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">Share Your Code</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">Send your referral link to friends, family, or social media.</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-xl">2️⃣</div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">They Sign Up</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">When someone signs up with your code, they're linked to you.</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-xl">3️⃣</div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">You Earn {COMMISSION_RATE * 100}%</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">When they buy something, you earn commission on the sale.</p>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6 sm:p-8">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-4">Recent Activity</h2>
              {events.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted)]">No activity yet. Share your referral code to get started!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {events.slice(0, 20).map((event) => (
                    <div key={event.id} className="flex items-center gap-3 rounded-lg border border-white/[0.03] bg-white/[0.01] px-4 py-3">
                      <span className="text-base shrink-0">
                        {event.type === "signup" ? "🎉" : "💰"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--foreground)] truncate">
                          {event.type === "signup"
                            ? `New signup — ${event.referredEmail || "Someone"} joined using your code`
                            : `Commission earned — ${event.listingTitle || "a listing"}`
                          }
                        </p>
                        <p className="text-[10px] text-[var(--muted)]">
                          {event.createdAt?.toDate?.()?.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) || "Just now"}
                        </p>
                      </div>
                      {event.amount && (
                        <span className="shrink-0 text-sm font-bold text-emerald-400">+${event.amount.toFixed(2)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commission History */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--muted)]">Commission History</h2>
                <span className="text-[10px] text-[var(--muted)]">{commissions.length} total</span>
              </div>
              {commissions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-[var(--muted)]">No commissions yet. Share your code!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.04]">
                        <th className="pb-2 pr-4 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Listing</th>
                        <th className="pb-2 pr-4 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Referred</th>
                        <th className="pb-2 pr-4 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Amount</th>
                        <th className="pb-2 text-[10px] font-medium text-[var(--muted)] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((c) => (
                        <tr key={c.id} className="border-b border-white/[0.02]">
                          <td className="py-3 pr-4">
                            <Link href={`/post/listing/${c.listingId}`} className="text-[var(--foreground)] hover:text-sky-400 transition truncate block max-w-[200px]">
                              {c.listingTitle}
                            </Link>
                          </td>
                          <td className="py-3 pr-4 text-[var(--muted)] text-xs">{c.referredEmail}</td>
                          <td className="py-3 pr-4 font-bold text-emerald-400">${c.amount.toFixed(2)}</td>
                          <td className="py-3">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              c.status === "paid"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}>
                              {c.status === "paid" ? "Paid" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
