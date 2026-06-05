"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import MarketplaceListingCard from "../components/MarketplaceListingCard";
import { showToast } from "../components/Toast";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import {
  getRecentlyViewed,
  isInWatchlist,
  saveRecentlyViewed,
  timeAgo,
} from "../lib/listing-card-utils";
import {
  adjustListingWatchlistCount,
  listingWatchlistCount,
  listingWatchlistGlowIntensity,
} from "../lib/listing-watchlist-count";
import { cdnUrl } from "../lib/cdn";
import { useSellerListingMeta } from "../lib/useSellerListingMeta";

const CATEGORIES = ["All"];

function rentalSearchText(item: Record<string, unknown>): string {
  return [item.title, item.description, item.category, item.location]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function listingMatchesSearch(item: Record<string, unknown>, query: string): boolean {
  const haystack = rentalSearchText(item);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

export default function RentalsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  const { sellerReviewStats, sellerBadges } = useSellerListingMeta(listings);

  useEffect(() => {
    const refreshRecentlyViewed = () => setRecentlyViewed(getRecentlyViewed());
    refreshRecentlyViewed();
    window.addEventListener("focus", refreshRecentlyViewed);
    return () => window.removeEventListener("focus", refreshRecentlyViewed);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "rental"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: any[] = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((i: any) => isListingVisibleInMarketplace(i));
        items.sort(
          (a: any, b: any) =>
            (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)
        );
        setListings(items);
      },
      (err) => {
        console.error("Failed to load rental listings:", err);
      }
    );
    return () => unsub();
  }, []);

  function handleBuyNow(item: any) {
    if (!isListingVisibleInMarketplace(item)) return;
    if (item.paymentType === "contact") {
      router.push(`/post/listing/${item.id}`);
      return;
    }
    router.push(`/post/listing/${item.id}?buy=1`);
  }

  async function toggleWatchlist(item: any) {
    const existing = JSON.parse(localStorage.getItem("watchlist") || "[]");
    const index = existing.findIndex((fav: any) => fav.id === item.id);

    if (index >= 0) {
      existing.splice(index, 1);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      if (user?.uid) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid, "watchlist", item.id));
          if (snap.exists()) {
            await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id));
            void adjustListingWatchlistCount(item.id, -1);
          }
        } catch (e) {
          console.error(e);
        }
      }
      showToast("Removed from watchlist", "info");
    } else {
      existing.unshift(item);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      if (user?.uid) {
        try {
          await setDoc(doc(db, "users", user.uid, "watchlist", item.id), {
            id: item.id,
            title: item.title,
            price: item.price,
            imageUrl: item.imageUrl || item.image || "",
            savedPrice: item.price,
            savedAt: new Date().toISOString(),
          });
          void adjustListingWatchlistCount(item.id, 1);
        } catch (e) {
          console.error("Watchlist save failed:", e);
          showToast("Failed to save to watchlist", "error");
        }
      }
      showToast("Added to watchlist!");
    }
    setWatchlistTick((t) => t + 1);
  }

  const hotItems = useMemo(
    () =>
      [...listings]
        .filter((l) => isListingVisibleInMarketplace(l))
        .sort(
          (a, b) =>
            listingWatchlistCount(b) +
            (b.bidCount || 0) -
            (listingWatchlistCount(a) + (a.bidCount || 0))
        )
        .slice(0, 6),
    [listings]
  );

  const rentalRecentlyViewed = useMemo(() => {
    const rentalIds = new Set(listings.map((l) => l.id));
    return recentlyViewed.filter((r: any) => {
      if (r.type === "rental") return true;
      if (r.type && r.type !== "rental") return false;
      return rentalIds.has(r.id);
    });
  }, [recentlyViewed, listings]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim();
    return listings.filter((item) => {
      if (selectedCategory !== "All" && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return listingMatchesSearch(item, q);
    });
  }, [listings, selectedCategory, searchQuery]);

  const hasActiveFilters =
    selectedCategory !== "All" || searchQuery.trim().length > 0;

  const clearFilters = () => {
    setSelectedCategory("All");
    setSearchQuery("");
  };

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-10 pt-6">
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.14),transparent)] pointer-events-none" />
          <div className="relative flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3.5 py-1 text-[10px] font-semibold text-emerald-400 mb-4 tracking-wide uppercase">
              Property & Equipment
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
                Rentals
              </span>
            </h1>
            <p className="mt-3 max-w-2xl mx-auto text-sm leading-relaxed text-zinc-400">
              Rent homes, rooms, vehicles, tools, and equipment. Message the owner to arrange pickup, delivery, and return dates.
            </p>
            <div className="group relative mt-5 w-full max-w-2xl">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-sky-500/30 via-emerald-500/30 to-sky-500/30 opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100" />
              <div className="relative flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm transition-all duration-300 focus-within:border-emerald-500/40 focus-within:ring-2 focus-within:ring-emerald-500/25">
                <div className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                  <svg
                    className="h-4 w-4 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rentals, location, category..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-[15px] text-white outline-none placeholder:text-zinc-500"
                  aria-label="Search rentals"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
                    aria-label="Clear search"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <Link
                  href="/post/ai?type=rental"
                  className="mr-1.5 ml-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-emerald-500 px-3 py-2 text-[13px] font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:gap-2 sm:px-4"
                >
                  <svg
                    className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">List a Rental</span>
                  <span className="sm:hidden">List</span>
                </Link>
              </div>
            </div>

            <details className="group mt-4 w-full max-w-2xl overflow-hidden rounded-xl border border-emerald-500/10 bg-gradient-to-b from-emerald-500/[0.03] to-transparent text-left">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-400 transition hover:bg-emerald-500/[0.04] [&::-webkit-details-marker]:hidden">
                <span>📖 How It Works</span>
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-emerald-400/70 transition group-open:rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="border-t border-emerald-500/10 px-3 pb-3 pt-0.5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-[11px]">
                      🔍
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--foreground)]">Browse Rentals</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Find what you need and check availability and price.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-[11px]">
                      💳
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--foreground)]">Return & Complete</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Checkout through Stripe with buyer protection.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-[11px]">
                      💬
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--foreground)]">Message Owner</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Arrange pickup, delivery, and return dates with the owner.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-[11px]">
                      ✅
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--foreground)]">Secure Booking</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Return the item and mark complete — funds release to the owner.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <div className="mt-3 w-full max-w-2xl rounded-xl border border-red-500/10 bg-red-500/[0.03] px-3 py-2.5 text-left">
              <p className="text-[10px] leading-relaxed text-red-400/80">
                ⚠️ <span className="font-bold text-red-400">Stay safe.</span> Never pay outside Sky Drop. Keep all
                communication in our chat. Report suspicious behaviour immediately.
              </p>
            </div>
          </div>
        </div>

        {listings.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400/90">
                Category
              </span>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition focus:border-emerald-500/40 cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-zinc-900">
                      {c === "All" ? "All categories" : c}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="text-[11px] text-zinc-500">
                {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
                {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-white/[0.06] px-3 py-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  ✕ Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {hotItems.length > 0 && (
          <div className="mb-8 overflow-visible">
            <div className="relative mb-4 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-500 to-emerald-500" />
                <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-white">
                  🔥 Hot This Week
                </p>
              </div>
            </div>
            <div className="-mx-1 flex gap-3 overflow-x-auto overflow-y-visible px-1 py-3 scrollbar-none">
              {hotItems.map((item: any) => {
                const hotSaves = listingWatchlistCount(item);
                const hotGlow = listingWatchlistGlowIntensity(hotSaves);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveRecentlyViewed(item);
                      router.push(`/post/listing/${item.id}`);
                    }}
                    className="group w-56 shrink-0 cursor-pointer rounded-xl border bg-white/[0.02] p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.04] sm:w-60"
                    style={{
                      borderColor: `rgba(16, 185, 129, ${0.12 + hotGlow * 0.5})`,
                      boxShadow: `0 0 ${Math.round(8 + hotGlow * 44)}px rgba(16, 185, 129, ${0.08 + hotGlow * 0.42})`,
                    }}
                  >
                    <div className="relative overflow-hidden rounded-lg">
                      {item.images?.[0] || item.imageUrl || item.image ? (
                        <img
                          src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")}
                          alt={item.title}
                          loading="lazy"
                          className="h-28 w-full rounded-lg object-cover transition-all duration-500 group-hover:scale-105 sm:h-32"
                        />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/10 via-emerald-500/10 to-emerald-600/10 text-xs text-zinc-500 sm:h-32">
                          💾
                        </div>
                      )}
                      <div className="absolute top-1.5 left-1.5">
                        <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">
                          🔥 Trending
                        </span>
                      </div>
                      <div
                        className="absolute bottom-1.5 right-1.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold backdrop-blur-md"
                        style={{
                          borderColor: `rgba(16, 185, 129, ${0.3 + hotGlow * 0.7})`,
                          backgroundColor: `rgba(0, 0, 0, ${0.5 + hotGlow * 0.15})`,
                          color: `rgba(196, 181, 253, ${0.8 + hotGlow * 0.2})`,
                          boxShadow: `0 0 ${Math.round(4 + hotGlow * 18)}px rgba(16, 185, 129, ${0.25 + hotGlow * 0.55})`,
                        }}
                      >
                        ⭐ {hotSaves.toLocaleString()} {hotSaves === 1 ? "save" : "saves"}
                      </div>
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <p className="flex-1 truncate text-xs font-bold text-white">{item.title}</p>
                      <p className="shrink-0 text-sm font-black text-emerald-400">${item.price}</p>
                    </div>
                    {item.category && (
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.category}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      {item.createdAt?.seconds != null && (
                        <span>{timeAgo(item.createdAt.seconds)}</span>
                      )}
                      <span
                        className="flex items-center gap-1 font-semibold"
                        style={{
                          color: `rgba(196, 181, 253, ${0.55 + hotGlow * 0.45})`,
                          textShadow:
                            hotGlow > 0.15
                              ? `0 0 ${Math.round(4 + hotGlow * 8)}px rgba(167, 139, 250, ${hotGlow * 0.45})`
                              : undefined,
                        }}
                      >
                        ⭐ {hotSaves.toLocaleString()} {hotSaves === 1 ? "save" : "saves"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">💾</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No rentals yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to list a rental.</p>
            <Link
              href="/post/ai?type=rental"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105 active:scale-95"
            >
              List a Rental
            </Link>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🔍</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {searchQuery.trim()
                ? "No matching listings"
                : `No listings in ${selectedCategory}`}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              {searchQuery.trim()
                ? "Try different keywords or browse all rentals."
                : "Try another category or list your product here."}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5 mt-4">
              <div className="flex items-center gap-3">
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-sky-500 to-emerald-500" />
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white">Rental Listings</h2>
                  <p className="text-[11px] text-zinc-500">
                    {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""} found
                    {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                    {selectedCategory !== "All" ? ` · ${selectedCategory}` : ""}
                  </p>
                </div>
              </div>
            </div>
            <div
              key={watchlistTick}
              className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {filteredListings.map((item, cardIndex) => (
                <MarketplaceListingCard
                  key={item.id}
                  item={item}
                  cardIndex={cardIndex}
                  accent="sky"
                  user={user}
                  isInWatchlist={isInWatchlist}
                  onToggleWatchlist={toggleWatchlist}
                  onCardClick={() => {
                    saveRecentlyViewed(item);
                    router.push(`/post/listing/${item.id}`);
                  }}
                  onBuyNow={handleBuyNow}
                  onMakeOffer={(listing) => router.push(`/post/listing/${listing.id}`)}
                  sellerReviewStats={sellerReviewStats}
                  sellerBadges={sellerBadges}
                />
              ))}
            </div>
          </>
        )}

        {rentalRecentlyViewed.length > 0 && (
          <div className="mt-10">
            <div className="relative mb-3 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-500 to-emerald-500" />
                <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">
                  Recently Viewed
                </p>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {rentalRecentlyViewed.map((item: any) => {
                const live = listings.find((l) => l.id === item.id);
                const card = live ? { ...item, ...live } : item;
                const imageSrc = card.images?.[0] || card.imageUrl || card.image;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveRecentlyViewed(card);
                      router.push(`/post/listing/${item.id}`);
                    }}
                    className="group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-[0_8px_25px_rgba(139,92,246,0.15)]"
                  >
                    {imageSrc ? (
                      <img
                        src={cdnUrl(imageSrc)}
                        alt={card.title}
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/15 via-emerald-500/15 to-emerald-600/15 text-xs text-zinc-500">
                        💾
                      </div>
                    )}
                    <p className="mt-2.5 truncate text-[15px] font-bold text-[var(--foreground)]">
                      {card.title}
                    </p>
                    <p className="mt-0.5 text-base font-black text-emerald-400">${card.price}</p>
                    {card.category && (
                      <p className="mt-1 truncate text-[10px] text-zinc-500">{card.category}</p>
                    )}
                    <p className="mt-1 text-[10px] text-[var(--muted)]">
                      ⭐ {listingWatchlistCount(card).toLocaleString()}{" "}
                      {listingWatchlistCount(card) === 1 ? "save" : "saves"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
