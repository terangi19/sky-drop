"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import Navbar from "./Navbar";
import Background from "./Background";
import AwhinaOnlineBadge from "./AwhinaOnlineBadge";
import ListingCard from "./ListingCard";
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
import {
  HOME_MARKETPLACE_THEME,
  type BrowseCategoryConfig,
} from "../lib/browse-category-config";
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
import { cdnUrl } from "../lib/cdn";
import { useSellerListingMeta } from "../lib/useSellerListingMeta";

function listingSearchText(
  item: Record<string, unknown>,
  extra?: (item: Record<string, unknown>) => string[]
): string {
  const parts = [
    item.title,
    item.description,
    item.location,
    item.category,
    ...(extra?.(item) || []),
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
  extra?: (item: Record<string, unknown>) => string[]
): boolean {
  const haystack = listingSearchText(item, extra);
  const words = queryText.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

type Props = {
  config: BrowseCategoryConfig;
};

export default function BrowseCategoryPage({ config }: Props) {
  const router = useRouter();
  const t = HOME_MARKETPLACE_THEME;
  const [listings, setListings] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [watchlistTick, setWatchlistTick] = useState(0);
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  const { sellerReviewStats, sellerBadges, sellerHandles } = useSellerListingMeta(listings);

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
      },
      (err) => {
        console.error(`Failed to load ${config.listingType} listings:`, err);
      }
    );
    return () => unsub();
  }, [config.listingType]);

  function handleBuyNow(item: any) {
    if (!isListingVisibleInMarketplace(item)) return;
    if (item.paymentType === "contact") {
      router.push(`/post/listing/${item.id}`);
      return;
    }
    router.push(`/post/listing/${item.id}?buy=1`);
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
      return listingMatchesSearch(item, q, config.extraSearchFields);
    });
  }, [
    listings,
    selectedRegion,
    selectedCity,
    selectedCategory,
    searchQuery,
    config.filterMode,
    config.extraSearchFields,
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
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 pb-10 pt-6 max-w-[90rem] 2xl:max-w-[120rem] 3xl:max-w-none 3xl:px-12 4xl:px-16">
        <div
          className={`relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent ${t.heroShadow}`}
        >
          <div className={`absolute inset-0 ${t.radial} pointer-events-none`} />

          <div className="relative flex items-center justify-center px-6 py-2.5 text-[12px] border-b border-white/[0.04]">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-widest">
                Live
              </span>
            </span>
            {trendingLiveTitles ? (
              <span className="truncate text-[11px] font-medium text-white">
                🔥 {trendingLiveTitles}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-white">{config.trendingFallback}</span>
            )}
          </div>

          <div className="relative overflow-visible px-6 py-10 sm:px-10 sm:py-12">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-black tracking-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl leading-none">
                <span
                  className={`bg-gradient-to-r bg-clip-text text-transparent ${t.titleGradient}`}
                >
                  {config.pageTitle}
                </span>
              </h1>
              <div className="mt-4 flex justify-center">
                <AwhinaOnlineBadge centered />
              </div>
              <p className="mt-4 max-w-xl mx-auto text-sm leading-relaxed text-white">
                {config.subtitle}
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-xl">
              <div className="group relative">
                <div
                  className={`absolute -inset-1 rounded-xl bg-gradient-to-r ${t.searchGlow} opacity-0 blur-lg transition duration-500 group-focus-within:opacity-100`}
                />
                <div
                  className={`relative flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm ring-0 transition-all duration-300 focus-within:ring-2 ${t.searchFocus}`}
                >
                  <div className="ml-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
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
                    type="text"
                    placeholder={config.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-3.5 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
                  />
                  <div className="mr-1.5 flex gap-1.5">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
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
                className={`inline-flex items-center gap-2 rounded-xl border bg-gradient-to-r px-5 py-2.5 text-sm font-bold shadow-[0_0_20px_rgba(0,0,0,0.08)] ring-1 transition hover:text-white active:scale-[0.97] ${t.sellLink}`}
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

        {hotItems.length > 0 && (
          <div className="mb-8 overflow-visible">
            <div className="relative mb-4 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className={`trending-now-accent h-5 w-1 rounded-full bg-gradient-to-b ${t.hotBarGradient}`} />
                <p className="trending-now-title text-[13px] font-bold uppercase tracking-[0.22em] text-white">
                  Trending Now
                </p>
              </div>
            </div>
            <div className="-mx-1 flex gap-3 overflow-x-auto overflow-y-visible px-1 py-3 scrollbar-none">
              {hotItems.map((item: any) => {
                const hotSaves = listingWatchlistCount(item);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveRecentlyViewed(item);
                      router.push(`/post/listing/${item.id}`);
                    }}
                    className="hot-week-card listing-card group w-56 shrink-0 cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-0 text-white transition-all duration-300 hover:-translate-y-1 sm:w-60"
                  >
                    <div className="relative overflow-hidden">
                      {item.images?.[0] || item.imageUrl || item.image ? (
                        <img
                          src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")}
                          alt={item.title}
                          loading="lazy"
                          className="h-36 w-full object-cover transition-all duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className={`flex h-36 items-center justify-center bg-gradient-to-br ${t.placeholderGradient} text-xs text-white`}
                        >
                          SD
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute top-2 left-2">
                        <span
                          className={`rounded-full ${t.hotBadge} px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm`}
                        >
                          🔥 Trending
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-bold text-white">{item.title}</p>
                      <p className="mt-1.5 text-lg font-black tracking-tight text-white drop-shadow-[0_0_8px_rgba(14,165,233,0.15)]">
                        ${item.price}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-white">
                        {item.location && <span>📍 {item.location}</span>}
                        {item.createdAt?.seconds != null && (
                          <span>{timeAgo(item.createdAt.seconds)}</span>
                        )}
                        <span className="ml-auto flex items-center gap-1">
                          ⭐ {hotSaves.toLocaleString()}
                        </span>
                      </div>
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
              <span className="text-3xl">{config.emoji}</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">{config.emptyTitle}</h2>
            <p className="mt-2 text-sm text-zinc-500">{config.emptySubtitle}</p>
            <Link
              href={`/post/ai?type=${config.postAiType}`}
              className={`mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${t.listBtn} px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 active:scale-95`}
            >
              {config.listCtaLong}
            </Link>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🔍</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
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
                  <h2 className="text-lg font-black tracking-tight text-[var(--foreground)]">
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
              className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 4xl:grid-cols-7 5xl:grid-cols-8"
            >
              {filteredListings.map((item, cardIndex) => (
                <ListingCard
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
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {typeRecentlyViewed.map((item: any) => {
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
                    className={`group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 ${t.recentHover}`}
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
                      <div
                        className={`flex h-20 items-center justify-center rounded-lg bg-gradient-to-br ${t.placeholderGradient} text-2xl`}
                      >
                        {config.emoji}
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-bold text-[var(--cream)]">
                      {card.title}
                    </p>
                    <p className={`text-sm font-black ${t.recentPrice}`}>${card.price}</p>
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
