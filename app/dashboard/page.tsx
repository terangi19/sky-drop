"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import DropTokenList from "../components/DropTokenList";
import SponsorDropModal from "../components/SponsorDropModal";
import LootCrateModal from "../components/LootCrateModal";
import DailyChallenges from "../components/DailyChallenges";
import { getLevelInfo } from "../lib/xp";
import { trackChallenge } from "../lib/challenges";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSponsor, setShowSponsor] = useState(false);
  const [sponsorListing, setSponsorListing] = useState<any>(null);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "profiles", user.uid), (snap) => {
      if (snap.exists()) setXp(snap.data().xp || 0);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) trackChallenge(user.uid, "visit_profile").catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub1 = onSnapshot(
      query(collection(db, "purchases"), where("sellerEmail", "==", user.email), limit(50)),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
        setSales(items); setLoading(false);
      },
      () => setLoading(false)
    );
    const unsub2 = onSnapshot(
      query(collection(db, "listings"), where("sellerEmail", "==", user.email), limit(50)),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
        setListings(items);
      },
      (err) => { console.error("Dashboard listings error:", err); }
    );
    const unsub3 = onSnapshot(
      query(collection(db, "reviews"), where("sellerEmail", "==", user.email)),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        items.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setReviews(items);
      }
    );
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [user?.email]);

  const stats = useMemo(() => {
    const completed = sales.filter((s) => s.status === "delivered");
    const pending = sales.filter((s) => !["delivered", "cancelled"].includes(s.status));
    const totalEarnings = completed.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "—";
    const fullStars = reviews.length > 0 ? Math.floor(Number(avgRating)) : 0;
    return {
      totalSales: sales.length,
      completedSales: completed.length,
      pendingOrders: pending.length,
      totalEarnings,
      activeListings: listings.filter((l) => l.status !== "sold").length,
      avgRating,
      reviewCount: reviews.length,
      fullStars,
    };
  }, [sales, listings, reviews]);

  const expiringSoon = useMemo(() =>
    listings.filter((l) => {
      if (l.status === "sold" || !l.expiresAt?.toMillis) return false;
      return l.expiresAt.toMillis() - Date.now() < 3 * 86400000 && l.expiresAt.toMillis() > Date.now();
    }),
    [listings]
  );

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <section className="relative z-10 mx-auto max-w-5xl px-6 py-10">
          <div className="h-8 w-48 rounded bg-zinc-800 animate-pulse" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-10">
<Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
        <h1 className="text-2xl font-black text-[var(--foreground)]">Seller Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Your sales and performance at a glance.</p>

        {/* Stats grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700/60">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">📦</span>Total Sales</p>
            <p className="mt-1 text-2xl font-black text-[var(--foreground)]">{stats.totalSales}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">✅</span>Completed</p>
            <p className="mt-1 text-2xl font-black text-emerald-400">{stats.completedSales}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">⏳</span>Pending</p>
            <p className="mt-1 text-2xl font-black text-amber-400">{stats.pendingOrders}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">💰</span>Earnings</p>
            <p className="mt-1 text-2xl font-black text-sky-400">${stats.totalEarnings.toFixed(2)}</p>
          </div>
        </div>

        {/* Rating card */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">⭐</span>Rating</p>
            <p className="mt-1 text-2xl font-black text-[var(--foreground)]">★ {stats.reviewCount > 0 ? stats.avgRating : "—"}</p>
            {stats.reviewCount > 0 ? (
              <p className="text-[10px] text-[var(--muted)]">{stats.reviewCount} review{stats.reviewCount > 1 ? "s" : ""}</p>
            ) : (
              <p className="text-[10px] text-[var(--muted)]">No reviews yet</p>
            )}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-[var(--muted)]"><span className="mr-1">📋</span>Active Listings</p>
            <p className="mt-1 text-2xl font-black text-[var(--foreground)]">{stats.activeListings}</p>
          </div>
          <Link href="/list-list" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center justify-between transition hover:border-zinc-700">
            <span className="text-xs text-[var(--muted)]">All Listings</span>
            <span className="text-xs text-sky-400">View →</span>
          </Link>
          <Link href="/sales" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex items-center justify-between transition hover:border-zinc-700">
            <span className="text-xs text-[var(--muted)]">All Sales</span>
            <span className="text-xs text-sky-400">View →</span>
          </Link>
        </div>

        {/* Pending orders CTA */}
        {stats.pendingOrders > 0 && (
          <>
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-amber-400 font-bold">{stats.pendingOrders} pending order{stats.pendingOrders > 1 ? "s" : ""} need your attention</p>
              <Link href="/sales" className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-amber-400">View Orders</Link>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">Go to <Link href="/sales" className="text-sky-400 hover:underline">Sales</Link> to confirm and ship orders.</p>
          </>
        )}

        {/* Quick actions */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/post" className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              <span className="text-xs font-bold text-[var(--foreground)]">Create Listing</span>
            </Link>
            <Link href="/sales" className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
              <span className="text-xs font-bold text-[var(--foreground)]">Sales</span>
            </Link>
            <Link href="/messages" className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <span className="text-xs font-bold text-[var(--foreground)]">Messages</span>
            </Link>
            <Link href="/profile" className="flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span className="text-xs font-bold text-[var(--foreground)]">Profile</span>
            </Link>
          </div>
        </div>

        {/* Payout */}
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Payouts</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Available balance: <span className="font-bold text-sky-400">${stats.totalEarnings.toFixed(2)}</span></p>
          <p className="text-[10px] text-[var(--muted)]">Set up Stripe Connect in your profile to withdraw funds.</p>
          <Link href="/profile" className="mt-3 inline-block rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400">Manage Payout Settings</Link>
        </div>

        {/* Daily Challenges */}
        {user && <div className="mt-8"><DailyChallenges userId={user.uid} /></div>}

        {/* Expiring soon */}
        {expiringSoon.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Expiring Soon</h2>
            <div className="mt-3 space-y-2">
              {expiringSoon.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--foreground)]">{l.title}</p>
                    <p className="text-[10px] text-amber-400">Expires in {Math.ceil((l.expiresAt.toMillis() - Date.now()) / 86400000)} day{Math.ceil((l.expiresAt.toMillis() - Date.now()) / 86400000) > 1 ? "s" : ""}</p>
                  </div>
                  <Link href={`/post/edit/${l.id}`} className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] hover:bg-sky-400">Edit</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent orders */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Recent Orders</h2>
          {sales.length === 0 ? (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
              <p className="text-sm text-[var(--muted)]">No orders yet. Create a listing to start selling.</p>
              <Link href="/post" className="mt-3 inline-block rounded-lg bg-sky-500 px-5 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-sky-400">Create Listing</Link>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {sales.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--foreground)]">{s.listingTitle}</p>
                    <p className="text-xs text-[var(--muted)]">${Number(s.total).toFixed(2)} &middot; {s.buyerName || s.buyerEmail?.split("@")[0]}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    s.status === "delivered" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" :
                    s.status === "pending" ? "border-amber-500/20 bg-amber-500/10 text-amber-400" :
                    s.status === "cancelled" ? "border-red-500/20 bg-red-500/10 text-red-400" :
                    "border-sky-500/20 bg-sky-500/10 text-sky-400"
                  }`}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
          {sales.length > 5 && (
            <Link href="/sales" className="mt-3 inline-block text-xs text-sky-400 hover:underline">View all sales →</Link>
          )}
        </div>

        {/* Drop Tokens */}
        {user && <div className="mt-8"><DropTokenList userId={user.uid} userEmail={user.email!} /></div>}

        {/* XP & Level */}
        {user && (
          <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--muted)]">Level {getLevelInfo(xp).level}</p>
                <p className="text-lg font-black text-[var(--foreground)]">{xp} XP</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--muted)]">{getLevelInfo(xp).progress}/{getLevelInfo(xp).xpToNext}</p>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                style={{ width: `${getLevelInfo(xp).progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Sky Crate */}
        {user && <LootCrateModal userId={user.uid} userEmail={user.email!} onClose={() => {}} inline />}

        {/* Sponsor a Drop */}
        {user && listings.length > 0 && (
          <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--foreground)]">🎁 Sponsor a Drop</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">Send users to your listing for $5. Your page becomes the next drop target.</p>
              </div>
              <button onClick={() => { setSponsorListing(listings[0]); setShowSponsor(true); }}
                className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-amber-400 transition">
                Sponsor — $5
              </button>
            </div>
            {listings.length > 1 && (
              <div className="mt-3 flex gap-1.5 overflow-x-auto">
                {listings.map((l) => (
                  <button key={l.id} onClick={() => { setSponsorListing(l); setShowSponsor(true); }}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-bold transition ${
                      sponsorListing?.id === l.id ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-zinc-700 text-[var(--muted)] hover:border-zinc-600"
                    }`}>{l.title.slice(0, 20)}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {showSponsor && sponsorListing && user && (
          <SponsorDropModal listing={sponsorListing} sellerEmail={user.email!} userId={user.uid} onClose={() => setShowSponsor(false)} />
        )}
      </section>
    </main>
  );
}
