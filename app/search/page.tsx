"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import MarketplaceListingCard from "../components/MarketplaceListingCard";
import { useListings } from "../useListings";
import { useAuth } from "../contexts/AuthContext";
import { listingBuyHref } from "../lib/buy-listing-route";
import { listingPrimaryActionHref } from "../lib/listing-message-href";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";
import {
  getComparableListingPrice,
  listingMatchesPriceFilter,
  listingMatchesConditionFilter,
  listingMatchesSaleTypeFilter,
  listingMatchesServicePricingFilter,
  listingMatchesRentalRatePeriodFilter,
} from "../lib/listing-search-filters";
import {
  listingSupportsCondition,
  listingSupportsSaleType,
  listingSupportsServicePricingFilter,
  listingSupportsRentalRatePeriodFilter,
} from "../lib/listing-type-config";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { adjustListingWatchlistCount } from "../lib/listing-watchlist-count";
import { rankListingsBySearch } from "../lib/marketplace-fuzzy-search";
import { normalizeMarketplaceSearchQuery, processVoiceSearchTranscript } from "../lib/voice-search-pipeline";
import { logVoiceSearch } from "../lib/voice-search-logger";
import type { Listing } from "../../types/firestore";
import { db } from "../lib/firebase";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import EmptyState from "../components/EmptyState";
import { LoadingCard } from "../components/LoadingSpinner";
import { useSellerListingMeta } from "../lib/useSellerListingMeta";

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
  const { listings, loading, error: listingsError } = useListings();
  const skipNextUrlSyncRef = useRef(true);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [condition, setCondition] = useState("all");
  const [location, setLocation] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [saleType, setSaleType] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [servicePricingFilter, setServicePricingFilter] = useState("all");
  const [rentalPeriodFilter, setRentalPeriodFilter] = useState("all");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchSaved, setSearchSaved] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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

  // Push filter state to URL on change (debounced — local state stays instant while typing)
  useEffect(() => {
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
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
    }, 200);
    return () => window.clearTimeout(timer);
  }, [minPrice, maxPrice, condition, location, sortBy, saleType, query, router]);

  useEffect(() => {
    if (!user) {
      const resetState = window.requestAnimationFrame(() => {
        setWatchlist([]);
        setSavedSearches([]);
      });
      return () => window.cancelAnimationFrame(resetState);
    }
    let nextWatchlist: string[] = [];
    let nextSavedSearches: SavedSearch[] = [];
    const saved = localStorage.getItem(`watchlist_${user.uid}`);
    if (saved) {
      try {
        nextWatchlist = JSON.parse(saved) as string[];
      } catch (e) {
        console.error("Failed to parse watchlist:", e);
      }
    }
    const savedSearchesData = localStorage.getItem(`savedSearches_${user.uid}`);
    if (savedSearchesData) {
      try {
        nextSavedSearches = JSON.parse(savedSearchesData) as SavedSearch[];
      } catch (e) {
        console.error("Failed to parse saved searches:", e);
      }
    }
    const syncSavedState = window.requestAnimationFrame(() => {
      setWatchlist(nextWatchlist);
      setSavedSearches(nextSavedSearches);
    });
    return () => window.cancelAnimationFrame(syncSavedState);
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

  const toggleWatchlist = async (item: Listing) => {
    if (!user?.uid) return;
    const adding = !isInWatchlist(item.id);
    const newWatchlist = adding
      ? [...watchlist, item.id]
      : watchlist.filter((id) => id !== item.id);
    setWatchlist(newWatchlist);
    localStorage.setItem(`watchlist_${user.uid}`, JSON.stringify(newWatchlist));
    void adjustListingWatchlistCount(item.id, adding ? 1 : -1);

    try {
      if (adding) {
        const watchData = {
          listingId: item.id,
          title: item.title || "",
          price: item.price ?? "",
          image: item.images?.[0] || item.imageUrl || "",
          savedAt: serverTimestamp(),
        };
        await setDoc(doc(db, "users", user.uid, "watchlist", item.id), watchData);
        await setDoc(doc(db, "watchlist", `${user.uid}_${item.id}`), {
          ...watchData,
          userId: user.uid,
        });
      } else {
        await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id));
        await deleteDoc(doc(db, "watchlist", `${user.uid}_${item.id}`));
      }
    } catch (e) {
      console.error("Search watchlist sync failed:", e);
    }
  };

  const handleBuyNow = (item: Listing) => {
    router.push(
      isStripeCheckoutVisibleClient()
        ? listingBuyHref(item.id)
        : listingPrimaryActionHref(item as Listing & { id: string })
    );
  };

  const handleMakeOffer = (listing: Listing) => {
    // TODO: Implement offer modal
    router.push(`/post/listing/${listing.id}`);
  };

  const handlePromote = () => {
    // TODO: Implement promote modal
  };

  const handleDelete = () => {
    // TODO: Implement delete
  };

  const filteredListings = useMemo(() => {
    const normalizedQuery = query ? normalizeMarketplaceSearchQuery(query) : "";
    const searchIntent = query ? processVoiceSearchTranscript(heardRaw || query) : null;

    let base = listings.filter((listing) => {
      const matchesPrice = listingMatchesPriceFilter(listing, minPrice, maxPrice);
      const matchesCondition = listingMatchesConditionFilter(listing, condition);
      const matchesLocation =
        !location || listing.location?.toLowerCase().includes(location.toLowerCase());
      const matchesSaleType = listingMatchesSaleTypeFilter(listing, saleType);
      const matchesCategory =
        !categoryFilter ||
        categoryFilter === "all" ||
        listing.category?.toLowerCase() === categoryFilter.toLowerCase();
      const matchesType =
        typeFilter === "all" || (listing.type || "physical") === typeFilter;
      const matchesServicePricing = listingMatchesServicePricingFilter(
        listing,
        servicePricingFilter
      );
      const matchesRentalPeriod = listingMatchesRentalRatePeriodFilter(
        listing,
        rentalPeriodFilter
      );

      return (
        matchesPrice &&
        matchesCondition &&
        matchesLocation &&
        matchesSaleType &&
        matchesCategory &&
        matchesType &&
        matchesServicePricing &&
        matchesRentalPeriod &&
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
  }, [listings, query, heardRaw, categoryFilter, minPrice, maxPrice, condition, location, sortBy, saleType, typeFilter, servicePricingFilter, rentalPeriodFilter]);

  const sellerMetaListings = useMemo(
    () => filteredListings.slice(0, 24),
    [filteredListings]
  );
  const { sellerReviewStats, sellerBadges, sellerHandles, sellerDisplayNames, sellerAvatars, sellerFullyVerified, sellerMetaReady } = useSellerListingMeta(sellerMetaListings);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-white/[0.06] hover:text-[var(--foreground)]"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile filter trigger */}
        <div className="mb-4 flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="btn btn-secondary min-h-[44px] flex-1 gap-2"
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">On</span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                setCondition("all");
                setLocation("");
                setSortBy("newest");
                setSaleType("all");
              }}
              className="min-h-[44px] shrink-0 rounded-xl border border-red-500/20 bg-red-500/5 px-3 text-xs font-semibold text-red-400"
            >
              Clear
            </button>
          )}
        </div>

        {/* Desktop filter controls */}
        <div className="mb-6 hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:block sm:p-5 light:border-black/[0.08] light:bg-[var(--soft-card)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Refine results</h2>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{typeFilter === "wanted" ? "Budget" : typeFilter === "rental" ? "Rate" : "Price Range"}</label>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40" />
                <span className="text-[var(--muted)]">-</span>
                <input type="number" inputMode="decimal" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40">
                <option value="all">All</option>
                <option value="New">New</option>
                <option value="Used">Used</option>
                <option value="Refurbished">Refurbished</option>
                <option value="For parts">For parts</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Location</label>
              <input type="text" placeholder="Any city or region" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40">
                <option value="newest">Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sale Type</label>
              <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-sky-500/40">
                <option value="all">All</option>
                <option value="auction">Auctions</option>
                <option value="buy_now">Fixed price</option>
                <option value="auction_buy_now">Auction + fixed price</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile filter bottom sheet */}
        {filterSheetOpen && (
          <div className="fixed inset-0 z-[10030] sm:hidden" role="dialog" aria-modal="true" aria-label="Filters">
            <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-label="Close filters" onClick={() => setFilterSheetOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 max-h-[min(85dvh,640px)] overflow-y-auto overscroll-contain rounded-t-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px)+var(--mobile-nav-height,0px))] pt-3 shadow-[var(--shadow-lg)]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-subtle)]" aria-hidden />
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-[var(--foreground)]">Filters</h2>
                <button type="button" onClick={() => setFilterSheetOpen(false)} className="touch-target rounded-xl px-3 text-sm font-semibold text-sky-400">
                  Done
                </button>
              </div>
              <div className="grid gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{typeFilter === "wanted" ? "Budget" : typeFilter === "rental" ? "Rate" : "Price Range"}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" inputMode="decimal" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40" />
                    <span className="text-[var(--muted)]">-</span>
                    <input type="number" inputMode="decimal" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Condition</label>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40">
                    <option value="all">All</option>
                    <option value="New">New</option>
                    <option value="Used">Used</option>
                    <option value="Refurbished">Refurbished</option>
                    <option value="For parts">For parts</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Location</label>
                  <input type="text" placeholder="Any city or region" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sort By</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40">
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="popular">Most Popular</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sale Type</label>
                  <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-3 text-base text-[var(--foreground)] outline-none focus:border-sky-500/40">
                    <option value="all">All</option>
                    <option value="auction">Auctions</option>
                    <option value="buy_now">Fixed price</option>
                    <option value="auction_buy_now">Auction + fixed price</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]" role="status">
              <span className="h-2 w-2 rounded-full bg-[var(--info)]" aria-hidden />
              Updating results…
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <LoadingCard key={i} />
              ))}
            </div>
          </div>
        ) : listingsError ? (
          <EmptyState
            title="Couldn't load listings"
            description="Something went wrong loading search results. Check your connection and try again."
            actionLabel="Browse marketplace"
            actionHref="/"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            }
          />
        ) : filteredListings.length === 0 ? (
          <EmptyState
            title="No listings found"
            description={
              query
                ? `No results for “${normalizeMarketplaceSearchQuery(query)}”. Try widening filters or browsing the marketplace.`
                : "No listings match your current search. Try clearing filters or browsing all listings."
            }
            actionLabel="Browse all listings"
            actionHref="/"
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        ) : (
          <div className="grid items-stretch gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                sellerHandles={sellerHandles}
                sellerDisplayNames={sellerDisplayNames}
                sellerAvatars={sellerAvatars}
                sellerFullyVerified={sellerFullyVerified}
                sellerMetaReady={sellerMetaReady}
                onPromote={handlePromote}
                onDelete={handleDelete}
                neonGlow={false}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
