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
import HotThisWeek from "../components/HotThisWeek";
import BrowseMarketplaceHero from "../components/BrowseMarketplaceHero";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";
import { LISTING_GRID_MT, PAGE_SHELL_MARKETPLACE } from "../lib/page-layout";

const CATEGORIES = [
  { emoji: "✨", name: "All" },
  { emoji: "🔧", name: "Trades & Repairs" },
  { emoji: "🧹", name: "Cleaning & Maintenance" },
  { emoji: "📖", name: "Tutoring & Lessons" },
  { emoji: "📷", name: "Photography" },
  { emoji: "💪", name: "Personal Training" },
  { emoji: "🎉", name: "Events & Catering" },
  { emoji: "🛠️", name: "Other Services" },
];

function serviceSearchText(item: Record<string, unknown>): string {
  return [item.title, item.description, item.category, item.location]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function listingMatchesSearch(item: Record<string, unknown>, query: string): boolean {
  const haystack = serviceSearchText(item);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

export default function ServicesPage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  const { sellerReviewStats, sellerBadges, sellerFullyVerified } = useSellerListingMeta(listings);

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
    const q = query(collection(db, "listings"), where("type", "==", "service"));
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
        console.error("Failed to load service listings:", err);
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

  const serviceRecentlyViewed = useMemo(() => {
    const serviceIds = new Set(listings.map((l) => l.id));
    return recentlyViewed.filter((r: any) => {
      if (r.type === "service") return true;
      if (r.type && r.type !== "service") return false;
      return serviceIds.has(r.id);
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
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white transition-colors duration-300">
      <Background />
      <Navbar />

      <section className={`${PAGE_SHELL_MARKETPLACE} pb-8 pt-2 sm:pt-3`}>
        <BrowseMarketplaceHero
          badge="Freelance Services"
          title="Services"
        >
            <div className="group relative mt-4 w-full max-w-2xl">
              <div className={`absolute -inset-1 rounded-xl bg-gradient-to-r ${t.searchGlow} opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100`} />
              <div className={`relative flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm ring-0 transition-all duration-300 ${t.searchFocus}`}>
                <div className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                  <svg
                    className="h-4 w-4 text-zinc-400"
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
                  placeholder="Search services, skills, location..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-[15px] text-white outline-none placeholder:text-white/60"
                  aria-label="Search services"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/[0.06] hover:text-white"
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
                  href="/post/ai?type=service"
                  className={`mr-1.5 ml-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r ${t.listBtn} px-3 py-2 text-[13px] font-bold text-white shadow-lg transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:gap-2 sm:px-4`}
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
                  <span className="hidden sm:inline">Offer a Service</span>
                  <span className="sm:hidden">List</span>
                </Link>
              </div>
            </div>
        </BrowseMarketplaceHero>

        {listings.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all ${
                  selectedCategory === cat.name
                    ? "border-sky-400/30 bg-sky-500/10 text-white shadow-[0_0_24px_rgba(14,165,233,0.1)]"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200"
                }`}
              >
                <span className="text-sm leading-none">{cat.emoji}</span>
                {cat.name}
              </button>
            ))}
            <span className="text-[11px] text-white/50 ml-2">
              {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
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
        )}

        <HotThisWeek
          items={hotItems}
          timeAgo={timeAgo}
          saveRecentlyViewed={saveRecentlyViewed}
          cdnUrl={cdnUrl}
          user={user}
          sellerReviewStats={sellerReviewStats}
          sellerBadges={sellerBadges}
        />

        {listings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">💾</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No services yet</h2>
            <p className="mt-2 text-sm text-white/60">Be the first to list a service.</p>
            <Link
              href="/post/ai?type=service"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:scale-105 active:scale-95"
            >
              Offer a Service
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
            <p className="mt-2 text-sm text-white/60">
              {searchQuery.trim()
                ? "Try different keywords or browse all services."
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
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-sky-500 to-sky-500" />
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white">Service Listings</h2>
                  <p className="text-[11px] text-white/60">
                    {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""} found
                    {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                    {selectedCategory !== "All" ? ` · ${selectedCategory}` : ""}
                  </p>
                </div>
              </div>
            </div>
            <div
              key={watchlistTick}
              className={LISTING_GRID_MT}
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
                  sellerFullyVerified={sellerFullyVerified}
                />
              ))}
            </div>
          </>
        )}

        {serviceRecentlyViewed.length > 0 && (
          <div className="mt-10">
            <div className="relative mb-3 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className="h-5 w-1 rounded-full bg-gradient-to-b from-sky-500 to-sky-500" />
                <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-white">
                  Recently Viewed
                </p>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {serviceRecentlyViewed.map((item: any) => {
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
                    className="group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_8px_25px_rgba(139,92,246,0.15)]"
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
                      <div className="flex h-20 w-full items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/15 via-sky-500/15 to-sky-600/15 text-xs text-white/60">
                        💾
                      </div>
                    )}
                    <p className="mt-2.5 truncate text-[15px] font-bold text-white">
                      {card.title}
                    </p>
                    <p className="mt-0.5 text-base font-black text-sky-400">${card.price}</p>
                    {card.category && (
                      <p className="mt-1 truncate text-[10px] text-white/60">{card.category}</p>
                    )}
                    <p className="mt-1 text-[10px] text-white/60">
                      ⭐ {listingWatchlistCount(card).toLocaleString()}{" "}
                      {listingWatchlistCount(card) === 1 ? "save" : "saves"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      
        {/* Trust strip */}
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl border border-white/[0.04] bg-white/[0.015] px-6 py-4 sm:gap-x-14 lg:gap-x-20 backdrop-blur-sm">
          {[
            { label: "Flexible payments", sub: "Stripe or Arrange Purchase" },
            { label: "Dispute protection", sub: "7-day window" },
            { label: "Verified sellers", sub: "Profiles & reviews" },
            { label: "NZ community", sub: "Built for Aotearoa" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-white">{item.label}</p>
                <p className="text-[10px] text-white/70">{item.sub}</p>
              </div>
            </div>
          ))}
        </div></section>
    </main>
  );
}







