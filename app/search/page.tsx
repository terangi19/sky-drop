"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import MarketplaceListingCard from "../components/MarketplaceListingCard";
import { useListings } from "../useListings";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../contexts/ProfileContext";
import { cdnUrl } from "../lib/cdn";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { listingWatchlistCount, listingWatchlistGlowIntensity } from "../lib/listing-watchlist-count";
import { SellerReviewSummary } from "../components/SellerReviewStars";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const { user } = useAuth();
  const { username } = useProfile();
  const { listings, loading } = useListings();

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [condition, setCondition] = useState("all");
  const [location, setLocation] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
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
  }, [user]);

  const isInWatchlist = (id: string) => watchlist.includes(id);

  const toggleWatchlist = (item: any) => {
    if (!user) return;
    const newWatchlist = isInWatchlist(item.id)
      ? watchlist.filter((id) => id !== item.id)
      : [...watchlist, item.id];
    setWatchlist(newWatchlist);
    localStorage.setItem(`watchlist_${user.uid}`, JSON.stringify(newWatchlist));
  };

  const handleBuyNow = (item: any) => {
    router.push(`/post/listing/${item.id}`);
  };

  const handleMakeOffer = (listing: any) => {
    // TODO: Implement offer modal
    router.push(`/post/listing/${listing.id}`);
  };

  const handlePromote = (listing: any) => {
    // TODO: Implement promote modal
  };

  const handleDelete = (listing: any) => {
    // TODO: Implement delete
  };

  const filteredListings = useMemo(() => {
    const filtered = listings.filter((listing) => {
    const searchLower = query.toLowerCase();
    const matchesSearch =
      !query ||
      listing.title?.toLowerCase().includes(searchLower) ||
      listing.description?.toLowerCase().includes(searchLower) ||
      listing.category?.toLowerCase().includes(searchLower);

    const price = Number(listing.price) || 0;
    const matchesMinPrice = !minPrice || price >= Number(minPrice);
    const matchesMaxPrice = !maxPrice || price <= Number(maxPrice);
    const matchesCondition = condition === "all" || listing.condition === condition;
    const matchesLocation = location === "all" || listing.location?.toLowerCase().includes(location.toLowerCase());

    return matchesSearch && matchesMinPrice && matchesMaxPrice && matchesCondition && matchesLocation;
  });

    const sorted = [...filtered];
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
  }, [listings, query, minPrice, maxPrice, condition, location, sortBy]);

  const sellerReviewStats: Record<string, { avg: number; count: number }> = {};
  const sellerBadges: Record<string, string> = {};
  const sellerFullyVerified: Record<string, boolean> = {};

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            {query ? `Search results for "${query}"` : "All Listings"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {loading ? "Loading..." : `${filteredListings.length} listing${filteredListings.length !== 1 ? "s" : ""} found`}
          </p>
        </div>

        {/* Filter Controls */}
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex flex-wrap gap-4">
            {/* Price Range */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Price Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-24 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
                />
                <span className="text-[var(--muted)]">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-24 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
                />
              </div>
            </div>

            {/* Condition */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-32 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
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
                placeholder="City or region"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-40 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              />
            </div>

            {/* Sort */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-36 rounded-lg border border-white/[0.06] bg-[var(--card)] px-3 py-2 text-sm text-white outline-none focus:border-sky-500/40"
              >
                <option value="newest">Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="popular">Most Popular</option>
              </select>
            </div>

            {/* Clear Filters */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-transparent">Clear</label>
              <button
                onClick={() => { setMinPrice(""); setMaxPrice(""); setCondition("all"); setLocation("all"); }}
                className="h-9 rounded-lg border border-red-500/20 bg-red-500/5 px-4 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        {loading ? (
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
        ) : filteredListings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500/[0.15] to-sky-500/[0.05] border border-sky-500/30 shadow-[0_0_30px_rgba(14,165,233,0.15)]">
              <svg className="h-10 w-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white mb-2">No listings found</h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              {query ? `No results found for "${query}"` : "No listings available"}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.97]"
            >
              Browse All Listings
            </button>
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
