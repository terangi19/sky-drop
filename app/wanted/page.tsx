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
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { listingBuyHref } from "../lib/buy-listing-route";
import { listingPrimaryActionHref } from "../lib/listing-message-href";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";
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
import {
  citiesForRegionFromListings,
  listingMatchesCity,
  listingMatchesRegion,
  NZ_REGIONS,
} from "../lib/nz-region-cities";
import ListingImage, { listingHasImage } from "../components/ListingImage";
import { useSellerListingMeta } from "../lib/useSellerListingMeta";
import HotThisWeek from "../components/HotThisWeek";
import BrowseMarketplaceHero from "../components/BrowseMarketplaceHero";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";
import { LISTING_GRID_MT, PAGE_SHELL_MARKETPLACE } from "../lib/page-layout";
import {
  emptyListBody,
  emptyListCtaLabel,
  emptyListHeadline,
} from "../lib/listing-type-config";

const WANTED_CATEGORIES = ["All", "Items", "Services", "Rentals"];

function wantedSearchText(item: Record<string, unknown>): string {
  return [
    item.title,
    item.description,
    item.location,
    item.category,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function listingMatchesSearch(item: Record<string, unknown>, query: string): boolean {
  const haystack = wantedSearchText(item);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

export default function WantedPage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loadingListings, setLoadingListings] = useState(true);

  const { sellerReviewStats, sellerBadges, sellerHandles, sellerDisplayNames, sellerAvatars, sellerFullyVerified, sellerMetaReady } = useSellerListingMeta(listings);

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
    const q = query(collection(db, "listings"), where("type", "==", "wanted"), limit(100));
    getDocs(q).then((snap) => {
      const items: any[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((i: any) => isListingVisibleInMarketplace(i))
        .sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0))
        .slice(0, 60);
      setListings(items);
      setLoadingListings(false);
    }).catch((err) => { console.error("Failed to load wanted listings:", err); setLoadingListings(false); });
  }, []);

  function handleBuyNow(item: any) {
    if (!isListingVisibleInMarketplace(item)) return;
    router.push(
      isStripeCheckoutVisibleClient()
        ? listingBuyHref(item.id)
        : listingPrimaryActionHref(item)
    );
  }

  async function toggleWatchlist(item: any) {
    const wasSaved = isInWatchlist(item.id);

    if (user?.uid) {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "watchlist", item.id));
        if (snap.exists()) {
          await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id));
        }
      } catch (e) {
        console.error(e);
      }
    }

    const existing = JSON.parse(localStorage.getItem("watchlist") || "[]");
    const index = existing.findIndex((fav: any) => fav.id === item.id);

    if (index >= 0) {
      existing.splice(index, 1);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      showToast("Removed from watchlist", "info");
      if (wasSaved) void adjustListingWatchlistCount(item.id, -1);
    } else {
      existing.unshift(item);
      localStorage.setItem("watchlist", JSON.stringify(existing));
      if (user?.uid) {
        setDoc(doc(db, "users", user.uid, "watchlist", item.id), {
          id: item.id,
          title: item.title,
          price: item.price,
          imageUrl: item.imageUrl || item.image || "",
          savedPrice: item.price,
          savedAt: new Date().toISOString(),
        }).catch((e) => {
          console.error("Watchlist save failed:", e);
          showToast("Failed to save to watchlist", "error");
        });
      }
      showToast("Added to watchlist!");
      void adjustListingWatchlistCount(item.id, 1);
    }
    setWatchlistTick((t) => t + 1);
  }

  const cityOptions = useMemo(() => {
    if (selectedRegion === "All") return [];
    return citiesForRegionFromListings(selectedRegion, listings);
  }, [selectedRegion, listings]);

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

  const wantedRecentlyViewed = useMemo(() => {
    const wantedIds = new Set(listings.map((l) => l.id));
    return recentlyViewed.filter((r: any) => {
      if (r.type === "wanted") return true;
      if (r.type && r.type !== "wanted") return false;
      return wantedIds.has(r.id);
    });
  }, [recentlyViewed, listings]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim();
    return listings.filter((item) => {
      if (selectedCategory !== "All" && item.category !== selectedCategory) return false;
      const matchesRegion =
        selectedRegion === "All" || listingMatchesRegion(item.location, selectedRegion);
      if (!matchesRegion) return false;
      if (selectedCity !== "All" && !listingMatchesCity(item.location, selectedCity)) {
        return false;
      }
      if (!q) return true;
      return listingMatchesSearch(item, q);
    });
  }, [listings, selectedRegion, selectedCity, searchQuery, selectedCategory]);

  const hasActiveFilters =
    selectedRegion !== "All" || selectedCity !== "All" || searchQuery.trim().length > 0 || selectedCategory !== "All";

  const clearFilters = () => {
    setSelectedRegion("All");
    setSelectedCity("All");
    setSearchQuery("");
    setSelectedCategory("All");
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedCity("All");
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white transition-colors duration-300">
      <Background /><Navbar />

      <section className={`${PAGE_SHELL_MARKETPLACE} pb-8 pt-2 sm:pt-3`}>
        <BrowseMarketplaceHero
          badge="Wanted"
          title="Wanted"
        >
          <div className="group relative mt-4 w-full max-w-2xl">
            <div className={`absolute -inset-1 rounded-xl bg-gradient-to-r ${t.searchGlow} opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100`} />
            <div className={`relative flex items-center rounded-xl bg-white/[0.03] backdrop-blur-sm ring-0 transition-all duration-300 ${t.searchFocus}`}>
              <div className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wanted listings..."
                className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-[15px] text-white outline-none placeholder:text-white/60"
                aria-label="Search wanted listings"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Clear search"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <Link
                href="/post/ai?type=wanted"
                className={`mr-1.5 ml-1 flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r ${t.listBtn} px-3 py-2 text-[13px] font-bold text-white shadow-lg transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:gap-2 sm:px-4`}
              >
                <svg className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Post Wanted Listing</span>
                <span className="sm:hidden">Post</span>
              </Link>
            </div>
          </div>
        </BrowseMarketplaceHero>

        {/* Explanation section */}
        <div className="mx-auto mt-6 max-w-2xl rounded-2xl bg-sky-500/5 p-6 text-center">
          <h3 className="text-lg font-bold text-sky-300">What are Wanted posts?</h3>
          <p className="mt-2 text-sm text-zinc-300">
            Post what you're looking for and let sellers come to you. Instead of searching through listings, describe what you need and sellers with matching items will reach out to you.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2">
              <span className="text-lg">📦</span>
              <span className="text-xs text-zinc-400">Looking for items</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2">
              <span className="text-lg">🛠️</span>
              <span className="text-xs text-zinc-400">Need services</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2">
              <span className="text-lg">🔑</span>
              <span className="text-xs text-zinc-400">Want to rent</span>
            </div>
          </div>
        </div>

        {listings.length > 0 && (
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">Category</span>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none rounded-lg bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer"
                >
                  {WANTED_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className="bg-zinc-900">
                      {cat}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">Region</span>
              <div className="relative">
                <select
                  value={selectedRegion}
                  onChange={(e) => handleRegionChange(e.target.value)}
                  className="appearance-none rounded-lg bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer"
                >
                  <option value="All" className="bg-zinc-900">
                    All regions
                  </option>
                  {NZ_REGIONS.map((r) => (
                    <option key={r} value={r} className="bg-zinc-900">
                      {r}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {selectedRegion !== "All" && cityOptions.length > 0 && (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">City</span>
                  <div className="relative">
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="appearance-none rounded-lg bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition focus:border-sky-500/40 cursor-pointer"
                    >
                      <option value="All" className="bg-zinc-900">
                        All cities
                      </option>
                      {cityOptions.map((c) => (
                        <option key={c} value={c} className="bg-zinc-900">
                          {c}
                        </option>
                      ))}
                    </select>
                    <svg
                      className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </>
              )}
              <span className="text-[11px] text-white/60">
                {filteredListings.length} wanted listing{filteredListings.length !== 1 ? "s" : ""}
                {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                {selectedRegion !== "All" ? ` in ${selectedRegion}` : ""}
                {selectedCity !== "All" ? ` · ${selectedCity}` : ""}
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
                >
                  ✕ Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {loadingListings ? (
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03]">
              <span className="text-3xl">📋</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">{emptyListHeadline("wanted")}</h2>
            <p className="mt-2 text-sm text-white/60">{emptyListBody("wanted")}</p>
            <Link href="/post/ai?type=wanted" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:scale-105 active:scale-95">
              {emptyListCtaLabel("wanted")}
            </Link>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03]">
              <span className="text-3xl">🔍</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {searchQuery.trim()
                ? "No matching wanted listings"
                : selectedCity !== "All"
                  ? `No wanted listings in ${selectedCity}`
                  : selectedRegion !== "All"
                    ? `No wanted listings in ${selectedRegion}`
                    : "No wanted listings match your filters"}
            </h2>
            <p className="mt-2 text-sm text-white/60">
              {searchQuery.trim()
                ? "Try different keywords, another city, or browse all wanted listings."
                : "Try another city or region, or post what you're looking for."}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
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
                  <h2 className="text-lg font-black tracking-tight text-white">Wanted Listings</h2>
                  <p className="text-[11px] text-white/60">
                    {filteredListings.length} wanted listing{filteredListings.length !== 1 ? "s" : ""} found
                    {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                    {selectedRegion !== "All" ? ` · ${selectedRegion}` : ""}
                    {selectedCity !== "All" ? ` · ${selectedCity}` : ""}
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
                  sellerHandles={sellerHandles}
                  sellerDisplayNames={sellerDisplayNames}
                  sellerAvatars={sellerAvatars}
                  sellerFullyVerified={sellerFullyVerified}
                  sellerMetaReady={sellerMetaReady}
                />
              ))}
            </div>
          </>
        )}

        {wantedRecentlyViewed.length > 0 && (
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
              {wantedRecentlyViewed.map((item: any) => {
                const live = listings.find((l) => l.id === item.id);
                const card = live ? { ...item, ...live } : item;
                const hasImage = listingHasImage(card);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveRecentlyViewed(card);
                      router.push(`/post/listing/${item.id}`);
                    }}
                    className="group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_8px_25px_rgba(234,179,8,0.15)]"
                  >
                    {hasImage ? (
                      <ListingImage
                        listing={card}
                        alt={card.title}
                        context={`WantedRecentlyViewed:${item.id}`}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/10 to-sky-500/10 text-2xl">
                        📋
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-bold text-always-white">{card.title}</p>
                    <p className="text-sm font-black text-sky-400">Budget: ${card.price}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl border border-white/[0.04] bg-white/[0.015] px-6 py-4 sm:gap-x-14 lg:gap-x-20 backdrop-blur-sm">
          {[
            { label: "Tell us what you need", sub: "Buyers post what they want" },
            { label: "Sellers come to you", sub: "Get offers from the community" },
            { label: "Free to post", sub: "No listing fees" },
            { label: "NZ community", sub: "Built for Aotearoa" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-white">{item.label}</p>
                <p className="text-[10px] text-white/70">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
