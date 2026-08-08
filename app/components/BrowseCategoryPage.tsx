"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import Navbar from "./Navbar";
import Background from "./Background";
import BrowseAwhinaAssistantPanel from "./BrowseAwhinaAssistantPanel";
import HotThisWeek from "./HotThisWeek";
import MarketplaceListingCard from "./MarketplaceListingCard";
import ListingImage, { listingHasImage } from "./ListingImage";
import { showToast } from "./Toast";
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
import { listingBuyHref } from "../lib/buy-listing-route";
import { listingPrimaryActionHref } from "../lib/listing-message-href";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";
import {
  BROWSE_CATEGORY_CONFIGS,
  HOME_MARKETPLACE_THEME,
  type BrowseCategoryKey,
} from "../lib/browse-category-config";
import {
  emptyListBody,
  emptyListCtaLabel,
  emptyListHeadline,
  type EmptyListKind,
} from "../lib/listing-type-config";
import {
  getRecentlyViewed,
  isInWatchlist,
  saveRecentlyViewed,
  timeAgo,
} from "../lib/listing-card-utils";
import {
  adjustListingWatchlistCount,
  listingWatchlistCount,
} from "../lib/listing-watchlist-count";
import {
  citiesForRegionFromListings,
  listingMatchesCity,
  listingMatchesRegion,
  NZ_REGIONS,
} from "../lib/nz-region-cities";
import { useSellerListingMeta } from "../lib/useSellerListingMeta";
import { LISTING_GRID_MT, PAGE_SHELL_MARKETPLACE } from "../lib/page-layout";

function categoryExtraSearchFields(
  configKey: BrowseCategoryKey,
  item: Record<string, unknown>
): string[] {
  switch (configKey) {
    case "vehicle":
      return [item.vehicleMake, item.vehicleModel, item.vehicleYear, item.vehicleBodyType]
        .filter(Boolean)
        .map(String);
    case "property":
      return [item.propertyType, item.bedrooms, item.bathrooms].filter(Boolean).map(String);
    case "job":
      return [item.jobCompany, item.employmentType].filter(Boolean).map(String);
    case "event":
      return [item.venue, item.eventTime].filter(Boolean).map(String);
    default:
      return [];
  }
}

function listingSearchText(
  item: Record<string, unknown>,
  configKey: BrowseCategoryKey
): string {
  const parts = [
    item.title,
    item.description,
    item.location,
    item.category,
    ...categoryExtraSearchFields(configKey, item),
  ];
  return parts
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function listingMatchesSearch(
  item: Record<string, unknown>,
  queryText: string,
  configKey: BrowseCategoryKey
): boolean {
  const haystack = listingSearchText(item, configKey);
  const words = queryText.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

type Props = {
  configKey: BrowseCategoryKey;
};

export default function BrowseCategoryPage({ configKey }: Props) {
  const config = BROWSE_CATEGORY_CONFIGS[configKey];
  const router = useRouter();
  const t = HOME_MARKETPLACE_THEME;
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const emptyKind: EmptyListKind =
    config.listingType === "service" ||
    config.listingType === "rental" ||
    config.listingType === "wanted" ||
    config.listingType === "vehicle" ||
    config.listingType === "physical"
      ? (config.listingType as EmptyListKind)
      : "physical";

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
    document.title = `${config.sellCta} — Sky Drop`;
  }, [config.sellCta]);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "listings"),
      where("type", "==", config.listingType)
    );
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
        setLoading(false);
      },
      (err) => {
        console.error(`Failed to load ${config.listingType} listings:`, err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [config.listingType]);

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
    setWatchlistTick((n) => n + 1);
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

  const typeRecentlyViewed = useMemo(() => {
    const ids = new Set(listings.map((l) => l.id));
    return recentlyViewed.filter((r: any) => {
      if (r.type === config.listingType) return true;
      if (r.type && r.type !== config.listingType) return false;
      return ids.has(r.id);
    });
  }, [recentlyViewed, listings, config.listingType]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim();
    return listings.filter((item) => {
      if (config.filterMode === "region") {
        const matchesRegion =
          selectedRegion === "All" || listingMatchesRegion(item.location, selectedRegion);
        if (!matchesRegion) return false;
        if (selectedCity !== "All" && !listingMatchesCity(item.location, selectedCity)) {
          return false;
        }
      } else if (selectedCategory !== "All" && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return listingMatchesSearch(item, q, configKey);
    });
  }, [
    listings,
    selectedRegion,
    selectedCity,
    selectedCategory,
    searchQuery,
    config.filterMode,
    configKey,
  ]);

  const hasActiveFilters =
    config.filterMode === "region"
      ? selectedRegion !== "All" || selectedCity !== "All" || searchQuery.trim().length > 0
      : selectedCategory !== "All" || searchQuery.trim().length > 0;

  const clearFilters = () => {
    setSelectedRegion("All");
    setSelectedCity("All");
    setSelectedCategory("All");
    setSearchQuery("");
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedCity("All");
  };

  const trendingLiveTitles = useMemo(() => {
    const top = [...listings]
      .filter((l: any) => (l.views || 0) > 0 || (l.bidCount || 0) > 0)
      .sort(
        (a: any, b: any) =>
          (Number(b.views) || 0) +
          (Number(b.bidCount) || 0) -
          (Number(a.views) || 0) -
          (Number(a.bidCount) || 0)
      )
      .slice(0, 3);
    return top.map((l: any) => l.title).join(" · ");
  }, [listings]);

  const filterCountLabel = `${filteredListings.length} ${filteredListings.length === 1 ? config.itemSingular : config.itemPlural}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-white transition-colors duration-300">
      <Background />
      <Navbar />

      <section className={`${PAGE_SHELL_MARKETPLACE} pb-10 pt-6`}>
        <div
          className={`relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent ${t.heroShadow}`}
        >
          <div className={`absolute inset-0 ${t.radial} pointer-events-none`} />

          <div className="relative flex items-center justify-center px-6 py-2.5 text-[12px] border-b border-white/[0.04]">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
              </span>
              <span className="text-[10px] font-medium text-sky-400/60 uppercase tracking-widest">
                Live
              </span>
            </span>
            {trendingLiveTitles ? (
              <span className="truncate text-[11px] font-medium text-white">
                {trendingLiveTitles}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-white">{config.trendingFallback}</span>
            )}
          </div>

          <div className="relative overflow-visible px-4 py-8 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl lg:text-6xl leading-none">
                <span
                  className={`bg-gradient-to-r bg-clip-text text-transparent ${t.titleGradient} ${t.titleDropShadow}`}
                >
                  {config.pageTitle}
                </span>
              </h1>
            </div>

            <BrowseAwhinaAssistantPanel className="mt-4 mb-0 mx-auto w-full max-w-2xl text-left" />

            <div className="mx-auto mt-6 max-w-xl">
              <div className="group relative">
                <div
                  className={`absolute -inset-1 rounded-xl bg-gradient-to-r ${t.searchGlow} opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100`}
                />
                <div
                  className={`relative flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm ring-0 transition-all duration-300 focus-within:ring-2 ${t.searchFocus}`}
                >
                  <svg
                    className="ml-4 h-4 w-4 shrink-0 text-sky-400"
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
                  <input
                    type="text"
                    placeholder={config.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-3.5 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] sm:text-[15px]"
                  />
                  <div className="mr-1.5 flex gap-1.5">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear search"
                        className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <Link
                href={`/post/ai?type=${config.postAiType}`}
                className={`btn btn-primary inline-flex items-center gap-2 ${t.sellLink}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/20 text-xs">
                  ✦
                </span>
                {config.sellCta}
              </Link>
            </div>

            <div className="mx-auto mt-6 max-w-2xl">
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white">
                {config.trustRow.map((line) => (
                  <span key={line} className="flex items-center gap-1.5">
                    {line}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {listings.length > 0 && (
          <div className="mb-8 mt-6">
            <div className="flex flex-wrap items-center gap-3">
              {config.filterMode === "region" ? (
                <>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.filterLabel}`}>
                    Region
                  </span>
                  <div className="relative">
                    <select
                      value={selectedRegion}
                      onChange={(e) => handleRegionChange(e.target.value)}
                      className={`appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition cursor-pointer ${t.filterFocus}`}
                    >
                      <option value="All" className="bg-[var(--card)] text-[var(--foreground)]">
                        All regions
                      </option>
                      {NZ_REGIONS.map((r) => (
                        <option key={r} value={r} className="bg-[var(--card)] text-[var(--foreground)]">
                          {r}
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
                  {selectedRegion !== "All" && cityOptions.length > 0 && (
                    <>
                      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.filterLabel}`}>
                        City
                      </span>
                      <div className="relative">
                        <select
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className={`appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition cursor-pointer ${t.filterFocus}`}
                        >
                          <option value="All" className="bg-[var(--card)] text-[var(--foreground)]">
                            All cities
                          </option>
                          {cityOptions.map((c) => (
                            <option key={c} value={c} className="bg-[var(--card)] text-[var(--foreground)]">
                              {c}
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
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.filterLabel}`}>
                    Category
                  </span>
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className={`appearance-none rounded-lg border border-white/[0.06] bg-black/40 px-3 py-2 pr-8 text-[11px] text-white outline-none transition cursor-pointer ${t.filterFocus}`}
                    >
                      {(config.categories || ["All"]).map((c) => (
                        <option key={c} value={c} className="bg-[var(--card)] text-[var(--foreground)]">
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
                </>
              )}
              <span className="text-[11px] text-zinc-500">
                {filterCountLabel}
                {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                {config.filterMode === "region" && selectedRegion !== "All"
                  ? ` in ${selectedRegion}`
                  : ""}
                {config.filterMode === "region" && selectedCity !== "All"
                  ? ` · ${selectedCity}`
                  : ""}
                {config.filterMode === "category" && selectedCategory !== "All"
                  ? ` in ${selectedCategory}`
                  : ""}
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

        <HotThisWeek
          items={hotItems}
          timeAgo={timeAgo}
          saveRecentlyViewed={saveRecentlyViewed}
          user={user}
          sellerReviewStats={sellerReviewStats}
          sellerBadges={sellerBadges}
          sellerFullyVerified={sellerFullyVerified}
        />

        {loading ? (
          <div className={`${LISTING_GRID_MT} mt-12`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-lg font-semibold text-sky-400">
              {config.emoji}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {emptyListHeadline(emptyKind)}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">{emptyListBody(emptyKind)}</p>
            <Link
              href={`/post/ai?type=${config.postAiType}`}
              className="btn btn-primary mt-5"
            >
              {emptyListCtaLabel(emptyKind)}
            </Link>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-sky-400">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {searchQuery.trim()
                ? `No matching ${config.itemPlural}`
                : config.filterMode === "region" && selectedCity !== "All"
                  ? `No ${config.itemPlural} in ${selectedCity}`
                  : config.filterMode === "region" && selectedRegion !== "All"
                    ? `No ${config.itemPlural} in ${selectedRegion}`
                    : `No ${config.itemPlural} in ${selectedCategory}`}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              {searchQuery.trim()
                ? `Try different keywords or browse all ${config.itemPlural}.`
                : `Try another filter or list your ${config.itemSingular} here.`}
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
                <div className={`h-7 w-1 rounded-full bg-gradient-to-b ${t.barGradient}`} />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                    {config.listingsHeading}
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    {filterCountLabel} found
                    {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ""}
                    {config.filterMode === "region" && selectedRegion !== "All"
                      ? ` · ${selectedRegion}`
                      : ""}
                    {config.filterMode === "region" && selectedCity !== "All"
                      ? ` · ${selectedCity}`
                      : ""}
                    {config.filterMode === "category" && selectedCategory !== "All"
                      ? ` · ${selectedCategory}`
                      : ""}
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
                  sellerFullyVerified={sellerFullyVerified}
                />
              ))}
            </div>
          </>
        )}

        {typeRecentlyViewed.length > 0 && (
          <div className="mt-10">
            <div className="relative mb-3 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className={`h-5 w-1 rounded-full bg-gradient-to-b ${t.barGradient}`} />
                <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-white">
                  Recently Viewed
                </p>
              </div>
            </div>
            <div className="mobile-h-scroll gap-3">
              {typeRecentlyViewed.map((item: any) => {
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
                    className={`group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors ${t.recentHover}`}
                  >
                    {hasImage ? (
                      <ListingImage
                        listing={card}
                        alt={card.title}
                        context={`BrowseRecentlyViewed:${item.id}`}
                        className="h-20 w-full rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-20 items-center justify-center rounded-lg bg-gradient-to-br ${t.placeholderGradient} text-sm font-semibold text-sky-400`}
                      >
                        {config.emoji}
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-semibold text-always-white">
                      {card.title}
                    </p>
                    <p className={`text-sm font-bold ${t.recentPrice}`}>${card.price}</p>
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
