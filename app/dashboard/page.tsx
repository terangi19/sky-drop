"use client";

import { useEffect, useMemo, useState } from "react";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { User } from "firebase/auth";
import { collection, doc, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { getLevelInfo, setUserLevel } from "../lib/xp";
import { trackChallenge } from "../lib/challenges";
import { isAdminEmail } from "../lib/admin-check";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { sumStripeCheckoutEarnings, sellerHasStripeConfigured } from "../lib/seller-payments";
import { REVIEW_STAR_CLASS } from "../components/SellerReviewStars";
import BrowseMarketplaceHero from "../components/BrowseMarketplaceHero";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";
import { PAGE_SHELL_WIDE } from "../lib/page-layout";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sales, setSales] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [xp, setXp] = useState(0);
  const [sellerProfile, setSellerProfile] = useState<any>(null);

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
      if (snap.exists()) {
        setXp(snap.data().xp || 0);
        setSellerProfile(snap.data());
      }
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) trackChallenge(user.uid, "visit_profile").catch(() => {});
  }, [user?.uid]);

  // Temporary: Set level 10 for testing with Ctrl+Shift+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L' && user?.email?.includes('testaudit')) {
        e.preventDefault();
        setUserLevel(user.uid, 10).then(() => {
          console.log('Set to level 10 for testing');
        }).catch(err => {
          console.error('Failed to set level:', err);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user?.uid, user?.email]);

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

  const statCardsScrollAnimation = useScrollAnimation(0.1);

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

  const levelInfo = useMemo(() => getLevelInfo(xp), [xp]);

  const quickActions = useMemo(
    () => [
      { href: "/post/ai", label: "Create listing", primary: true },
      { href: "/sales", label: "Sales" },
      { href: "/list-list", label: "My listings" },
      { href: "/messages", label: "Messages" },
      { href: "/profile", label: "Profile" },
      ...(isAdminEmail(user?.email) ? [{ href: "/admin", label: "Admin" }] : []),
    ],
    [user?.email]
  );

  const statCards = useMemo(
    () => [
      {
        label: "Total sales",
        value: String(stats.totalSales),
        hint: `${stats.completedSales} completed · ${stats.pendingOrders} pending`,
        accent: "from-sky-500 to-sky-400",
        icon: "📊",
      },
      {
        label: "Active listings",
        value: String(stats.activeListings),
        hint: `${listings.length} total posted`,
        accent: "from-violet-500 to-violet-400",
        icon: "📦",
      },
      {
        label: "Seller rating",
        value: stats.reviewCount > 0 ? stats.avgRating : "—",
        hint: stats.reviewCount > 0 ? `${stats.reviewCount} review${stats.reviewCount > 1 ? "s" : ""}` : "No reviews yet",
        accent: "from-amber-500 to-amber-400",
        star: stats.reviewCount > 0,
        icon: "⭐",
      },
    ],
    [stats, listings.length]
  );

  function DashboardSkeleton() {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white">
        <Background />
        <Navbar />
        <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
          <div className={`h-48 rounded-3xl border border-white/[0.04] bg-gradient-to-br from-white/[0.04] to-white/[0.01] animate-shimmer ${t.heroShadow}`}>
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer-slow" />
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 animate-shimmer" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-3 w-16 rounded-full bg-white/[0.08] mb-3" />
                <div className="h-8 w-20 rounded-lg bg-white/[0.06] mb-2" />
                <div className="h-2 w-24 rounded-full bg-white/[0.04]" />
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 animate-shimmer" style={{ animationDelay: '400ms' }}>
              <div className="h-4 w-24 rounded-full bg-white/[0.08] mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
                    <div className="flex-1">
                      <div className="h-3 w-32 rounded-full bg-white/[0.06] mb-2" />
                      <div className="h-2 w-24 rounded-full bg-white/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 animate-shimmer" style={{ animationDelay: '500ms' }}>
                <div className="h-4 w-20 rounded-full bg-white/[0.08] mb-3" />
                <div className="h-6 w-24 rounded-lg bg-white/[0.06]" />
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 animate-shimmer" style={{ animationDelay: '600ms' }}>
                <div className="h-4 w-20 rounded-full bg-white/[0.08] mb-3" />
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-full rounded-lg bg-white/[0.06]" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <style jsx>{`
          @keyframes shimmer {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          @keyframes shimmer-slow {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-shimmer {
            animation: shimmer 2s ease-in-out infinite;
          }
          .animate-shimmer-slow {
            animation: shimmer-slow 3s ease-in-out infinite;
          }
        `}</style>
      </main>
    );
  }

  if (!authChecked || loading) return <DashboardSkeleton />;

  if (!user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white">
        <Background />
        <Navbar />
        <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
          <BrowseMarketplaceHero badge="Seller Hub" title="Dashboard">
            <p className="mt-4 text-sm text-zinc-400">Sign in to see your sales, listings, and seller stats.</p>
            <Link
              href="/login"
              className={`mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${t.listBtn} px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.97]`}
            >
              Sign in
            </Link>
          </BrowseMarketplaceHero>
        </section>
      </main>
    );
  }

  const displayName = user.displayName?.split(" ")[0] || "there";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white transition-colors duration-300">
      <Background />
      <Navbar />

      <section className={`${PAGE_SHELL_WIDE} pb-10 pt-2 sm:pt-3`}>
        <BrowseMarketplaceHero badge="Seller Hub" title="Dashboard">
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-zinc-400">
              Hey {displayName}
            </p>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                levelInfo.level >= 10 
                  ? "border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.15)]" 
                  : "border-sky-500/20 bg-sky-500/10"
              }`}>
                <span className={`text-xs font-bold ${
                  levelInfo.level >= 10 ? "text-amber-400" : "text-white"
                }`}>
                  Level {levelInfo.level}
                  {levelInfo.level >= 10 && <span className="ml-1">👑</span>}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                  <span>{xp} XP</span>
                  <span>{levelInfo.xpToNext} XP to Level {levelInfo.level + 1}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500"
                    style={{ width: `${levelInfo.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </BrowseMarketplaceHero>

        {stats.pendingOrders > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-sky-300">
              {stats.pendingOrders} pending order{stats.pendingOrders > 1 ? "s" : ""} need your attention
            </p>
            <Link
              href="/sales"
              className="shrink-0 rounded-lg bg-gradient-to-r from-sky-500 to-sky-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 active:scale-[0.97]"
            >
              View orders
            </Link>
          </div>
        )}

        {!sellerHasStripeConfigured(sellerProfile) && (
          <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-amber-400">💳 Set up Stripe for instant payments</p>
                <p className="mt-1 text-xs text-amber-400/80">
                  Enable Pay Now to receive instant card payments. Without Stripe, buyers can only use Arrange Purchase.
                </p>
              </div>
              <Link
                href="/profile"
                className="shrink-0 rounded-lg bg-gradient-to-r from-amber-500 to-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:brightness-110 active:scale-[0.97]"
              >
                Set up Stripe
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-4 sm:p-5 transition-all duration-300 hover:border-white/[0.14] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {card.star && <span className={`${REVIEW_STAR_CLASS} mr-1 text-xl`}>★</span>}
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">{card.hint}</p>
                </div>
                <span className="text-3xl opacity-80">{card.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 sm:p-6 transition-all duration-300 hover:border-white/[0.12]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-lg ring-1 ring-sky-500/20">📋</div>
                <div>
                  <h2 className="text-base font-black text-white">Recent orders</h2>
                  <p className="text-[11px] text-zinc-500">Your latest sales activity</p>
                </div>
              </div>
              {sales.length > 0 && (
                <Link href="/sales" className="text-xs font-semibold text-sky-400 transition hover:text-sky-300">
                  View all →
                </Link>
              )}
            </div>

            {sales.length === 0 ? (
              <div className="mt-8 rounded-xl border border-dashed border-white/[0.08] bg-gradient-to-br from-white/[0.02] to-transparent px-6 py-10 text-center">
                <span className="text-4xl">📦</span>
                <p className="mt-3 text-sm text-zinc-400">No orders yet.</p>
                <p className="mt-1 text-xs text-zinc-500">Create a listing to start selling on Sky Drop.</p>
                <Link
                  href="/post/ai"
                  className={`mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${t.listBtn} px-5 py-2.5 text-xs font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.97]`}
                >
                  Create listing
                </Link>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-white/[0.05]">
                {sales.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0 transition-all duration-200 hover:bg-white/[0.03] rounded-xl px-3 -mx-2 border border-transparent hover:border-white/[0.05]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/10 text-lg ring-1 ring-sky-500/20">🛒</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{s.listingTitle}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        ${Number(s.total).toFixed(2)} · {s.buyerName || "Buyer"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold capitalize ${
                        s.status === "delivered"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : s.status === "pending"
                            ? "border-sky-500/20 bg-sky-500/10 text-sky-400"
                            : s.status === "cancelled"
                              ? "border-red-500/20 bg-red-500/10 text-red-400"
                              : "border-sky-500/20 bg-sky-500/10 text-sky-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 transition-all duration-300 hover:border-white/[0.12]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 text-lg ring-1 ring-emerald-500/20">💰</div>
                <h3 className="text-sm font-black text-white">Payouts</h3>
              </div>
              <p className="mt-3 text-2xl font-black text-emerald-400">${stats.stripeEarnings.toFixed(2)}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Stripe earnings from delivered orders. Arrange Purchase sales are paid off-platform.
              </p>
              <Link
                href="/profile"
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-bold text-zinc-200 transition hover:border-emerald-500/25 hover:bg-white/[0.06] hover:text-white"
              >
                Payout settings
              </Link>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-5 transition-all duration-300 hover:border-white/[0.12]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/10 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/10 text-lg ring-1 ring-violet-500/20">⚡</div>
                <h3 className="text-sm font-black text-white">Shortcuts</h3>
              </div>
              <div className="mt-3 space-y-2">
                {[
                  { href: "/list-list", label: "All listings", meta: `${listings.length} posted` },
                  { href: "/sales", label: "All sales", meta: `${stats.totalSales} total` },
                  { href: "/purchases", label: "My purchases", meta: "Buyer orders" },
                  { href: "/watchlist", label: "Watchlist", meta: "Saved items" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 transition hover:border-sky-500/20 hover:bg-white/[0.04]"
                  >
                    <span className="text-sm font-semibold text-zinc-200">{link.label}</span>
                    <span className="text-[10px] text-zinc-500">{link.meta}</span>
                  </Link>
                ))}
              </div>
            </div>

            {expiringSoon.length > 0 && (
              <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] to-sky-500/[0.02] p-5 transition-all duration-300 hover:border-sky-500/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-lg">⏰</div>
                  <h3 className="text-sm font-black text-sky-300">Expiring soon</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {expiringSoon.slice(0, 3).map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-sky-500/15 bg-black/30 px-3 py-2.5 transition-all duration-200 hover:bg-black/40">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-white">{l.title}</p>
                        <p className="text-[10px] text-sky-400/90">
                          {Math.ceil(((l.expiresAt?.toMillis?.() || 0) - Date.now()) / 86400000)}d left
                        </p>
                      </div>
                      <Link
                        href={`/post/ai?edit=${l.id}`}
                        className="shrink-0 rounded-lg bg-sky-500/20 px-2 py-1 text-[10px] font-bold text-sky-400 hover:bg-sky-500/30 transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
