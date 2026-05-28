"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";

export default function HustlerDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [links, setLinks] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "hustlerLinks"), where("promoterId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "hustlerCommissions"), where("promoterId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setCommissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const q = query(collection(db, "hustlerEvents"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEvents(all.filter((e: any) => e.promoterId === user?.uid));
    });
    return () => unsub();
  }, [user?.uid]);

  const totalClicks = links.reduce((s: number, l: any) => s + (l.clicks || 0), 0);
  const totalConversions = links.reduce((s: number, l: any) => s + (l.conversions || 0), 0);
  const pendingEarnings = commissions.filter((c) => c.status === "pending").reduce((s: number, c: any) => s + Number(c.commissionAmount || 0), 0);
  const confirmedEarnings = commissions.filter((c) => c.status === "confirmed").reduce((s: number, c: any) => s + Number(c.commissionAmount || 0), 0);
  const paidEarnings = commissions.filter((c) => c.status === "paid").reduce((s: number, c: any) => s + Number(c.commissionAmount || 0), 0);

  const myEvents = events;

  if (!authChecked) return null;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🚀</span>
              <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Hustler Dashboard</h1>
            </div>
            <p className="text-sm text-zinc-500">Your Sky Hustlers earnings and performance.</p>
          </div>
          <Link href="/promote" className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Browse Listings
          </Link>
        </div>

        {!user ? (
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] py-20 text-center">
            <p className="text-sm text-zinc-500">Sign in to view your Hustler dashboard.</p>
            <Link href="/login" className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl">
              Sign In
            </Link>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Total Clicks</p>
                <p className="mt-1 text-xl font-black tracking-tight text-[var(--foreground)]">{totalClicks}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Conversions</p>
                <p className="mt-1 text-xl font-black tracking-tight text-sky-400">{totalConversions}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Conv. Rate</p>
                <p className="mt-1 text-xl font-black tracking-tight text-amber-400">
                  {totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0.0"}%
                </p>
              </div>
            </div>

            {/* Earnings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              <div className="rounded-2xl border border-amber-500/10 bg-gradient-to-b from-amber-500/3 to-transparent p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Pending</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-amber-400">${pendingEarnings.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/10 bg-gradient-to-b from-emerald-500/3 to-transparent p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Confirmed</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-emerald-400">${confirmedEarnings.toFixed(2)}</p>
              </div>
              <div className="rounded-2xl border border-sky-500/10 bg-gradient-to-b from-sky-500/3 to-transparent p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Paid Out</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-sky-400">${paidEarnings.toFixed(2)}</p>
              </div>
            </div>

            {/* Referral links */}
            <div className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Your Referral Links</h2>
              {links.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-8 text-center">
                  <p className="text-sm text-zinc-500">No referral links yet.</p>
                  <Link href="/promote" className="mt-3 inline-flex rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-xs font-bold text-white transition hover:shadow-xl">
                    Find listings to promote
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {links.map((link) => (
                    <div key={link.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.015] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-sky-400 truncate select-all">
                          {typeof window !== "undefined" ? window.location.origin : ""}/post/listing/{link.listingId}?ref={link.code}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 shrink-0">
                        <span>👁 {link.clicks || 0}</span>
                        <span>🛒 {link.conversions || 0}</span>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/post/listing/${link.listingId}?ref=${link.code}`); }}
                          className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-400 hover:text-[var(--foreground)] transition">
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commission history */}
            <div className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Commission History</h2>
              {commissions.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-8 text-center">
                  <p className="text-sm text-zinc-500">No commissions yet. Start promoting!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commissions.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-2xl border border-white/[0.04] bg-white/[0.015] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--foreground)] truncate">{c.listingTitle || "Listing"}</p>
                        <p className="text-[10px] text-zinc-600">${Number(c.saleAmount || 0).toFixed(2)} sale · {c.commissionType === "percent" ? `${c.commissionValue}%` : `$${c.commissionValue}`}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-bold text-emerald-400">${Number(c.commissionAmount || 0).toFixed(2)}</p>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          c.status === "paid" ? "bg-emerald-500/10 text-emerald-400" :
                          c.status === "confirmed" ? "bg-sky-500/10 text-sky-400" :
                          c.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                          "bg-amber-500/10 text-amber-400"
                        }`}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live activity */}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Your Activity</h2>
              {myEvents.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-8 text-center">
                  <p className="text-sm text-zinc-500">No activity yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {myEvents.slice(0, 20).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2 py-1.5 text-xs leading-relaxed">
                      <span className="shrink-0 mt-0.5">
                        {ev.type === "commission" ? "💰" : ev.type === "promoted" ? "🚀" : "🎯"}
                      </span>
                      <span className="text-zinc-500">{ev.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
