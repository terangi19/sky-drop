"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import MarketplaceListingCard from "../components/MarketplaceListingCard";
import { useListings } from "../useListings";
import { useAuth } from "../contexts/AuthContext";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { rankListingsBySearch } from "../lib/marketplace-fuzzy-search";
import { normalizeMarketplaceSearchQuery, processVoiceSearchTranscript } from "../lib/voice-search-pipeline";
import { logVoiceSearch } from "../lib/voice-search-logger";
import type { Listing } from "../../types/firestore";

type SavedSearch = {
  key: string;
  query: string;
  minPrice: string;
  maxPrice: string;
  condition: string;
  location: string;
  saleType: string;
  timestamp: number;
};

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const heardRaw = searchParams.get("heard") || "";
  const categoryFilter = searchParams.get("category") || "";
  const { user } = useAuth();
  const { listings, loading } = useListings();
  const skipNextUrlSyncRef = useRef(true);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [condition, setCondition] = useState("all");
  const [location, setLocation] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [saleType, setSaleType] = useState("all");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchSaved, setSearchSaved] = useState(false);
  const urlFilterState = useMemo(
    () => ({
      maxPrice: searchParams.get("maxPrice") || "",
      minPrice: searchParams.get("minPrice") || "",
      location: searchParams.get("location") || "",
      condition: searchParams.get("condition") || "all",
      sortBy: searchParams.get("sortBy") || "newest",
      saleType: searchParams.get("saleType") || "all",
    }),
    [searchParams]
  );

  const searchKey = useMemo(
    () => `${query}-${minPrice}-${maxPrice}-${condition}-${location}-${saleType}`,
    [query, minPrice, maxPrice, condition, location, saleType]
  );

  const hasActiveFilters = Boolean(
    minPrice || maxPrice || location || condition !== "all" || sortBy !== "newest" || saleType !== "all"
  );

  // Sync filter state to URL params so search survives refresh and is shareable
  useEffect(() => {
    const syncFromUrl = window.requestAnimationFrame(() => {
      setMaxPrice(urlFilterState.maxPrice);
      setMinPrice(urlFilterState.minPrice);
      setLocation(urlFilterState.location);
      setCondition(urlFilterState.condition);
      setSortBy(urlFilterState.sortBy);
      setSaleType(urlFilterState.saleType);
      skipNextUrlSyncRef.current = true;
    });
    return () => window.cancelAnimationFrame(syncFromUrl);
  }, [urlFilterState]);

  // Push filter state to URL on change (debounced to avoid spam on rapid clicks)
  useEffect(() => {
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (condition !== "all") params.set("condition", condition);
    if (location) params.set("location", location);
    if (sortBy !== "newest") params.set("sortBy", sortBy);
    if (saleType !== "all") params.set("saleType", saleType);
    const qs = params.toString();
    const currentQs = window.location.search.replace("?", "");
    if (qs !== currentQs) {
      router.replace(`${window.location.pathname}?${qs}`, { scroll: false });
    }
  }, [minPrice, maxPrice, condition, location, sortBy, saleType, query, router]);

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
      setSavedSearches([]);
      return;
    }
    const saved = localStorage.getItem(`watchlist_${user.uid}`);
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse watchlist:", e);
      }
    }
    const savedSearchesData = localStorage.getItem(`savedSearches_${user.uid}`);
    if (savedSearchesData) {
      try {
        setSavedSearches(JSON.parse(savedSearchesData) as SavedSearch[]);
      } catch (e) {
        console.error("Failed to parse saved searches:", e);
      }
    }
  }, [user]);

  const checkIfSearchSaved = () => {
    if (!user) return false;
    return savedSearches.some((s) => s.key === searchKey);
  };

  const saveSearch = async () => {
    if (!user) return;
    const newSearch = {
      key: searchKey,
      query,
      minPrice,
      maxPrice,
      condition,
      location,
      saleType,
      timestamp: Date.now(),
    };
    const updatedSearches = [...savedSearches, newSearch];
    setSavedSearches(updatedSearches);
    localStorage.setItem(`savedSearches_${user.uid}`, JSON.stringify(updatedSearches));
    setSearchSaved(true);
    setTimeout(() => setSearchSaved(false), 2000);
  };

  const removeSavedSearch = () => {
    if (!user) return;
    const updatedSearches = savedSearches.filter((s) => s.key !== searchKey);
    setSavedSearches(updatedSearches);
    localStorage.setItem(`savedSearches_${user.uid}`, JSON.stringify(updatedSearches));
    setSearchSaved(false);
  };

  const isInWatchlist = (id: string) => watchlist.includes(id);

  const toggleWatchlist = (item: Listing) => {
    if (!user) return;
    const newWatchlist = isInWatchlist(item.id)
      ? watchlist.filter((id) => id !== item.id)
      : [...watchlist, item.id];
    setWatchlist(newWatchlist);
    localStorage.setItem(`watchlist_${user.uid}`, JSON.stringify(newWatchlist));
  };

  const handleBuyNow = (item: Listing) => {
    router.push(`/post/listing/${item.id}`);
  };

  const handleMakeOffer = (listing: Listing) => {
    // TODO: Implement offer modal
    router.push(`/post/listing/${listing.id}`);
  };

  const handlePromote = (_listing: Listing) => {
    // TODO: Implement promote modal
  };

  const handleDelete = (_listing: Listing) => {
    // TODO: Implement delete
  };

  const filteredListings = useMemo(() => {
    const normalizedQuery = query ? normalizeMarketplaceSearchQuery(query) : "";
    const searchIntent = query ? processVoiceSearchTranscript(heardRaw || query) : null;

    let base = listings.filter((listing) => {
      const price = Number(listing.price) || 0;
      const matchesMinPrice = !minPrice || price >= Number(minPrice);
      const matchesMaxPrice = !maxPrice || price <= Number(maxPrice);
      const matchesCondition = condition === "all" || listing.condition === condition;
      const matchesLocation =
        !location || listing.location?.toLowerCase().includes(location.toLowerCase());
      const matchesSaleType =
        saleType === "all" ||
        (saleType === "auction"
          ? listing.saleType === "auction" || listing.saleType === "auction_buy_now"
          : listing.saleType === saleType);
      const matchesCategory =
        !categoryFilter ||
        categoryFilter === "all" ||
        listing.category?.toLowerCase() === categoryFilter.toLowerCase();

      return (
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesCondition &&
        matchesLocation &&
        matchesSaleType &&
        matchesCategory &&
        isListingVisibleInMarketplace(listing)
      );
    });

    if (normalizedQuery) {
      // Use higher relevance threshold to exclude unrelated listings
      const ranked = rankListingsBySearch(base, searchIntent ?? normalizedQuery, { minScore: 3.0 });
      if (ranked.length > 0) {
        if (searchIntent && heardRaw) {
          logVoiceSearch(searchIntent, {
            source: "search_page",
            resultCount: ranked.length,
            topMatchTitle: String(ranked[0]?.listing.title ?? ""),
          });
        }
        base = ranked.map((r) => r.listing) as typeof listings;
      } else {
        // No relevant results - return empty instead of showing unrelated listings
        base = [];
      }
    }

    const sorted = [...base];
    if (sortBy === "price-low") {
      sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortBy === "price-high") {
      sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortBy === "popular") {
      sorted.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
    } else {
      sorted.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number })?.seconds || 0;
        const tb = (b.createdAt as { seconds?: number })?.seconds || 0;
        return tb - ta;
      });
    }
    return sorted;
  }, [listings, query, heardRaw, categoryFilter, minPrice, maxPrice, condition, location, sortBy, saleType]);

  const sellerReviewStats: Record<string, { avg: number; count: number }> = {};
  const sellerBadges: Record<string, string> = {};
  const sellerFullyVerified: Record<string, boolean> = {};

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-white sm:text-3xl">
              {query ? `Results for "${normalizeMarketplaceSearchQuery(query)}"` : "All Listings"}
            </h1>
            {heardRaw && heardRaw.toLowerCase() !== normalizeMarketplaceSearchQuery(query) && (
              <p className="mt-1 text-xs text-sky-400/90">
                Heard: &ldquo;{heardRaw}&rdquo;
              </p>
            )}
            <p className="mt-2 text-sm text-[var(--muted)]">
              {loading
                ? "Finding the best matches..."
                : `${filteredListings.length} listing${filteredListings.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
          {user && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={saveSearch}
                disabled={checkIfSearchSaved() || searchSaved}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                  checkIfSearchSaved() || searchSaved
                    ? "cursor-default border border-sky-500/30 bg-sky-500/10 text-sky-400"
                    : "border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20"
                }`}
              >
                {searchSaved || checkIfSearchSaved() ? (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Saved Search</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>Save Search</span>
                  </>
                )}
              </button>
              {checkIfSearchSaved() && (
                <button
                  onClick={removeSavedSearch}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-white/[0.06] hover:text-white"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        {/* Filter Controls */}
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Refine results</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Filters update instantly and stay in the URL.</p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setMinPrice("");
                  setMaxPrice("");
                  setCondition("all");
                  setLocation("");
                  setSortBy("newest");
                  setSaleType("all");
                }}
                className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 sm:text-sm"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {/* Price Range */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Price Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
                />
                <span className="text-[var(--muted)]">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
                />
              </div>
            </div>

            {/* Condition */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              >
                <option value="all">All</option>
                <option value="New">New</option>
                <option value="Used">Used</option>
                <option value="Refurbished">Refurbished</option>
                <option value="For parts">For parts</option>
              </select>
            </div>

            {/* Location */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Location</label>
              <input
                type="text"
                placeholder="Any city or region"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              />
            </div>

            {/* Sort */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              >
                <option value="newest">Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>

            {/* Sale Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sale Type</label>
              <select
                value={saleType}
                onChange={(e) => setSaleType(e.target.value)}
                className="w-full rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              >
                <option value="all">All</option>
                <option value="auction">Auctions</option>
                <option value="buy_now">Buy Now</option>
                <option value="auction_buy_now">Auction + Buy Now</option>
              </select>
            </div>

          </div>
        </div>

        {loading ? (
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
              Updating results...
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((_, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl bg-[var(--card)] border border-white/[0.04]">
                <div className="aspect-[4/3] w-full bg-gradient-to-br from-sky-500/[0.05] via-sky-500/[0.02] to-transparent animate-shimmer" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-3/4 rounded bg-gradient-to-r from-sky-500/[0.1] to-sky-500/[0.05] animate-shimmer" />
                  <div className="h-4 w-1/2 rounded bg-[var(--card)] animate-shimmer" />
                </div>
              </div>
            ))}
            </div>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 text-center sm:px-10">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500/[0.15] to-sky-500/[0.05] border border-sky-500/30 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
              <svg className="h-10 w-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white mb-2">No listings found</h2>
            <p className="mb-2 text-sm text-[var(--muted)]">
              {query
                ? `No results found for "${normalizeMarketplaceSearchQuery(query)}".`
                : "No listings match your current search right now."}
            </p>
            <p className="mb-6 text-xs text-[var(--muted)]">
              Try widening your price range, removing a filter, or browsing the full marketplace.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setMinPrice("");
                    setMaxPrice("");
                    setCondition("all");
                    setLocation("");
                    setSortBy("newest");
                    setSaleType("all");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
                >
                  Clear filters
                </button>
              )}
              <button
                onClick={() => router.push("/")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.97]"
              >
                Browse all listings
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredListings.map((item, cardIndex) => (
              <MarketplaceListingCard
                key={item.id}
                item={item}
                cardIndex={cardIndex}
                user={user}
                isInWatchlist={isInWatchlist}
                onToggleWatchlist={toggleWatchlist}
                onCardClick={() => router.push(`/post/listing/${item.id}`)}
                onBuyNow={handleBuyNow}
                onMakeOffer={handleMakeOffer}
                sellerReviewStats={sellerReviewStats}
                sellerBadges={sellerBadges}
                sellerFullyVerified={sellerFullyVerified}
                onPromote={handlePromote}
                onDelete={handleDelete}
                neonGlow={true}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
