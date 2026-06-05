"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { User } from "firebase/auth";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { getLevelInfo } from "../lib/xp";
import { trackChallenge } from "../lib/challenges";
import { isAdminEmail } from "../lib/admin-check";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { sumStripeCheckoutEarnings } from "../lib/seller-payments";
import { REVIEW_STAR_CLASS } from "../components/SellerReviewStars";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSponsor, setShowSponsor] = useState(false);
  const [sponsorListing, setSponsorListing] = useState<any>(null);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) setLoading(false);
    });
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
    const stripeEarnings = sumStripeCheckoutEarnings(sales, ["delivered"]);
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "—";
    const fullStars = reviews.length > 0 ? Math.floor(Number(avgRating)) : 0;
    return {
      totalSales: sales.length,
      completedSales: completed.length,
      pendingOrders: pending.length,
      stripeEarnings,
      activeListings: listings.filter((l) => isListingVisibleInMarketplace(l)).length,
      avgRating,
      reviewCount: reviews.length,
      fullStars,
    };
  }, [sales, listings, reviews]);

  const expiringSoon = useMemo(() =>
    listings.filter((l) => {
      if (!isListingVisibleInMarketplace(l) || !l.expiresAt?.toMillis) return false;
      return l.expiresAt.toMillis() - Date.now() < 3 * 86400000 && l.expiresAt.toMillis() > Date.now();
    }),
    [listings]
  );

  if (!authChecked) {
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

  if (!user) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background />
        <Navbar />
        <section className="relative z-10 mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <h1 className="text-2xl font-black text-[var(--foreground)]">Dashboard access</h1>
            <p className="mt-3 text-sm text-[var(--muted)]">Please sign in to view your dashboard.</p>
          </div>
        </section>
      </main>
    );
  }

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

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4 sm:mb-5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="relative mb-8">
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-white drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">Dashboard</span>
          </h1>
          <p className="relative mt-3 text-sm text-zinc-400 leading-relaxed max-w-xl">Your central hub for managing your Sky Drop activity. Monitor sales, track earnings, manage listings, and unlock rewards — all from one place.</p>
          <p className="relative mt-2 text-sm text-zinc-500">Your sales and performance at a glance.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: "Total Sales", value: stats.totalSales, color: "text-[var(--foreground)]", icon: "📦" },
            { label: "Completed", value: stats.completedSales, color: "text-emerald-400", icon: "✅" },
            { label: "Pending", value: stats.pendingOrders, color: "text-amber-400", icon: "⏳" },
            { label: "Stripe earnings", value: `$${stats.stripeEarnings.toFixed(2)}`, color: "text-sky-400", icon: "💰" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:bg-white/[0.04]">
              <p className="text-xs text-zinc-500">{s.icon} {s.label}</p>
              <p className={`mt-1.5 text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Secondary stats row */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4">
            <p className="text-xs text-zinc-500">⭐ Rating</p>
            <p className="mt-1.5 text-2xl font-black">
              <span className={REVIEW_STAR_CLASS}>★</span>{" "}
              <span className="text-white">{stats.reviewCount > 0 ? stats.avgRating : "—"}</span>
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{stats.reviewCount > 0 ? `${stats.reviewCount} review${stats.reviewCount > 1 ? "s" : ""}` : "No reviews yet"}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4">
            <p className="text-xs text-zinc-500">📋 Active Listings</p>
            <p className="mt-1.5 text-2xl font-black text-[var(--foreground)]">{stats.activeListings}</p>
          </div>
          <Link href="/list-list" className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 flex items-center justify-between transition-all duration-200 hover:bg-white/[0.04] group">
            <span className="text-xs text-zinc-500">All Listings</span>
            <span className="text-xs text-sky-400 group-hover:translate-x-0.5 transition-transform">View →</span>
          </Link>
          <Link href="/sales" className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 flex items-center justify-between transition-all duration-200 hover:bg-white/[0.04] group">
            <span className="text-xs text-zinc-500">All Sales</span>
            <span className="text-xs text-sky-400 group-hover:translate-x-0.5 transition-transform">View →</span>
          </Link>
        </div>

        {/* Pending orders banner */}
        {stats.pendingOrders > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-500/15 bg-gradient-to-b from-amber-500/5 to-transparent p-4 sm:p-5 flex items-center justify-between">
            <p className="text-sm font-bold text-amber-400">{stats.pendingOrders} pending order{stats.pendingOrders > 1 ? "s" : ""} need attention</p>
            <Link href="/sales" className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl active:scale-[0.97]">View Orders</Link>
          </div>
        )}

        {/* Quick actions */}
        <div className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { href: "/post/ai", icon: "M12 4v16m8-8H4", label: "Create Listing", color: "text-sky-400" },
              { href: "/sales", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", label: "Sales", color: "text-emerald-400" },
              { href: "/messages", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", label: "Messages", color: "text-sky-400" },
              { href: "/profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", label: "Profile", color: "text-sky-400" },
              ...(isAdminEmail(user?.email) ? [{ href: "/admin", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z", label: "Admin", color: "text-amber-400" }] : []),
            ]).map((a) => (
              <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.08] active:scale-[0.98] group">
                <svg className={`h-6 w-6 ${a.color} group-hover:scale-110 transition-transform duration-200`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                </svg>
                <span className="text-xs font-bold text-[var(--foreground)]">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Payouts */}
        <div className="mt-8 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-5 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Payouts</h2>
          <p className="mt-3 text-sm text-zinc-500">
            Stripe earnings (delivered): <span className="font-bold text-sky-400">${stats.stripeEarnings.toFixed(2)}</span>
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Arrange Purchase sales are paid off-platform and are not included here. Connect Stripe in your profile for card payouts.
          </p>
          <Link href="/profile" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Manage Payout Settings
          </Link>
        </div>

        {/* Expiring soon */}
        {expiringSoon.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Expiring Soon</h2>
            <div className="mt-3 space-y-2">
              {expiringSoon.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-2xl border border-amber-500/10 bg-gradient-to-b from-amber-500/3 to-transparent px-4 sm:px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--foreground)]">{l.title}</p>
                    <p className="text-[10px] text-amber-400">Expires in {Math.ceil(((l.expiresAt?.toMillis?.() || 0) - Date.now()) / 86400000)}d</p>
                  </div>
                  <Link href={`/post/ai?edit=${l.id}`} className="shrink-0 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">Edit</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent orders */}
        <div className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Recent Orders</h2>
          {sales.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-8 text-center">
              <p className="text-sm text-zinc-500">No orders yet. Create a listing to start selling.</p>
              <Link href="/post/ai" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">Create Listing</Link>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {sales.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.04] bg-white/[0.02] px-4 sm:px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--foreground)]">{s.listingTitle}</p>
                    <p className="text-xs text-zinc-500">${Number(s.total).toFixed(2)} · {s.buyerName || "Buyer"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-0.5 text-[9px] font-bold ${
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
            <Link href="/sales" className="mt-3 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors">
              View all sales <span>→</span>
            </Link>
          )}
        </div>

        {/* Job Applications hidden for now */}
      </section>
    </main>
  );
}
