"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import HustlerLinkModal from "../components/HustlerLinkModal";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { collection, doc, getDoc, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { showToast } from "../components/Toast";

interface Promotion {
  id: string;
  listingId: string;
  sellerId: string;
  enabled: boolean;
  commissionType: "percent" | "fixed";
  commissionValue: number;
  maxBudget: number;
  totalCommissionPaid: number;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

interface ListingMin {
  id: string;
  title: string;
  price: string;
  images?: string[];
  imageUrl?: string;
  image?: string;
  category?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  status?: string;
  views?: number;
  createdAt?: Timestamp;
  condition?: string;
}

function timeAgo(seconds: number) {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PromotePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [listings, setListings] = useState<Record<string, ListingMin>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [selectedListing, setSelectedListing] = useState<{ id: string; title: string; sellerId: string } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const now = new Date();
    const q = query(
      collection(db, "promotions"),
      where("enabled", "==", true),
      orderBy("expiresAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Promotion))
        .filter((p) => !p.expiresAt || p.expiresAt.toMillis() > now.getTime());
      setPromotions(items);
    }, (err) => console.error("Promotions query error:", err));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (promotions.length === 0) return;
    const ids = promotions.map((p) => p.listingId);
    const unsubs: (() => void)[] = [];
    for (const id of ids) {
      const unsub = onSnapshot(doc(db, "listings", id), (snap) => {
        if (snap.exists()) {
          setListings((prev) => ({ ...prev, [id]: { id: snap.id, ...snap.data() } as ListingMin }));
        }
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [promotions.length]);

  useEffect(() => {
    const q = query(collection(db, "hustlerEvents"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const activePromotions = useMemo(() => {
    return promotions
      .filter((p) => {
        const listing = listings[p.listingId];
        if (!listing) return false;
        const budgetLeft = p.maxBudget - (p.totalCommissionPaid || 0);
        return listing.status !== "sold" && listing.status !== "completed" && budgetLeft > 0;
      })
      .sort((a, b) => {
        const aPct = a.commissionType === "percent" ? a.commissionValue : 0;
        const bPct = b.commissionType === "percent" ? b.commissionValue : 0;
        return bPct - aPct;
      });
  }, [promotions, listings]);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🚀</span>
            <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Sky Hustlers</h1>
          </div>
          <p className="text-sm text-zinc-500">Promote other users' listings and earn commission on every sale you refer.</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Active Listings</p>
            <p className="mt-1 text-xl font-black tracking-tight text-sky-400">{activePromotions.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Top Commission</p>
            <p className="mt-1 text-xl font-black tracking-tight text-amber-400">
              {activePromotions.length > 0
                ? `${
                    activePromotions[0].commissionType === "percent"
                      ? `${activePromotions[0].commissionValue}%`
                      : `$${activePromotions[0].commissionValue}`
                  }`
                : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Total Earned</p>
            <p className="mt-1 text-xl font-black tracking-tight text-emerald-400">
              ${Math.abs(events.filter((e) => e.type === "commission").reduce((s: number, e: any) => s + Number(e.amount || 0), 0)).toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Commission Types</p>
            <p className="mt-1 text-xl font-black tracking-tight text-[var(--foreground)]">
              {activePromotions.filter((p) => p.commissionType === "percent").length}% · {activePromotions.filter((p) => p.commissionType === "fixed").length}$
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
          {/* Main feed */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Top Paying Drops</h2>
              <span className="text-[10px] text-zinc-600">{activePromotions.length} listings</span>
            </div>

            {activePromotions.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] py-20 text-center">
                <div className="text-4xl mb-3 opacity-30">🚀</div>
                <p className="text-sm text-zinc-500">No active promotions right now.</p>
                <p className="text-xs text-zinc-600 mt-1">Check back later or create your own listing with Promote & Earn enabled.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activePromotions.map((promo) => {
                  const listing = listings[promo.listingId];
                  if (!listing) return null;
                  const budgetLeft = promo.maxBudget - (promo.totalCommissionPaid || 0);
                  const budgetPct = (budgetLeft / promo.maxBudget) * 100;
                  const imgs = listing.images || (listing.imageUrl ? [listing.imageUrl] : listing.image ? [listing.image] : []);

                  return (
                    <div key={promo.id} className="group relative flex gap-4 rounded-2xl border border-white/[0.04] bg-white/[0.015] p-4 transition-all duration-200 hover:bg-white/[0.03] hover:border-white/[0.08] hover:shadow-xl hover:shadow-black/20">
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Image */}
                      <Link href={`/post/listing/${listing.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.02] ring-1 ring-white/[0.04]">
                        {imgs.length > 0 ? (
                          <img src={imgs[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-lg text-zinc-600">📦</div>
                        )}
                      </Link>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {listing.category && (
                            <span className="rounded-md bg-sky-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-sky-400 border border-sky-500/10">
                              {listing.category}
                            </span>
                          )}
                          {listing.condition && (
                            <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-400 border border-zinc-700/30">
                              {listing.condition}
                            </span>
                          )}
                        </div>

                        <Link href={`/post/listing/${listing.id}`} className="mt-1.5 block">
                          <h3 className="text-sm font-bold text-[var(--foreground)] leading-snug group-hover:text-sky-400 transition-colors">{listing.title}</h3>
                        </Link>

                        <div className="mt-2 flex items-center gap-3">
                          {listing.price && <span className="text-lg font-black text-sky-400">${listing.price}</span>}
                          <span className={`rounded-xl px-2.5 py-1 text-[10px] font-bold ${
                            promo.commissionType === "percent"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {promo.commissionType === "percent" ? `${promo.commissionValue}%` : `$${promo.commissionValue}`}
                          </span>
                          <span className="text-[10px] text-zinc-600">👁 {listing.views || 0}</span>
                        </div>

                        {/* Budget bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${budgetPct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-600 font-mono">${budgetLeft.toFixed(2)} left</span>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="flex shrink-0 flex-col items-end justify-between">
                        {user ? (
                          <button onClick={() => setSelectedListing({ id: listing.id, title: listing.title, sellerId: promo.sellerId })}
                            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-[11px] font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl active:scale-[0.97]">
                            Promote
                          </button>
                        ) : (
                          <Link href="/login" className="rounded-xl border border-white/[0.06] px-4 py-2 text-[11px] font-bold text-zinc-400 hover:text-[var(--foreground)] transition">
                            Sign in
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="space-y-3 xl:sticky xl:top-24">
            {/* Live feed */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Live Activity</p>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                {events.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic py-4 text-center">No activity yet...</p>
                ) : (
                  events.slice(0, 20).map((ev, i) => (
                    <div key={ev.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ opacity: i >= 5 ? 0.5 : 1 }}>
                      <span className="shrink-0 mt-0.5">
                        {ev.type === "commission" ? "💰" : ev.type === "promoted" ? "🚀" : "🎯"}
                      </span>
                      <span className="text-zinc-500">{ev.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500 mb-3">How It Works</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-400">1</span>
                  <p className="text-xs text-zinc-500">Pick a listing and click <span className="font-bold text-[var(--foreground)]">Promote</span></p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-400">2</span>
                  <p className="text-xs text-zinc-500">Copy your unique referral link and share it anywhere</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-400">3</span>
                  <p className="text-xs text-zinc-500">When someone buys through your link, you earn commission</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-400">4</span>
                  <p className="text-xs text-zinc-500">Track your earnings in the <Link href="/dashboard/hustler" className="text-sky-400 hover:text-sky-300">Hustler Dashboard</Link></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedListing && user && (
        <HustlerLinkModal
          listingId={selectedListing.id}
          listingTitle={selectedListing.title}
          sellerId={selectedListing.sellerId}
          promoterId={user.uid}
          onClose={() => setSelectedListing(null)}
        />
      )}
    </main>
  );
}
