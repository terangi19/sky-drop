import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chain = readFileSync(join(root, "app/vehicles/page.tsx"), "utf8");

const HEADER = `"use client";

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
import {
  citiesForRegionFromListings,
  listingMatchesCity,
  listingMatchesRegion,
  NZ_REGIONS,
} from "../lib/nz-region-cities";
import { cdnUrl } from "../lib/cdn";
import { useSellerListingMeta } from "../hooks/useSellerListingMeta";

function vehicleSearchText(item: Record<string, unknown>): string {
  return [
    item.title,
    item.description,
    item.location,
    item.category,
    item.vehicleMake,
    item.vehicleModel,
    item.make,
    item.model,
    item.vehicleBodyType,
    item.vehicleFuelType,
    item.vehicleTransmission,
    item.fuelType,
    item.transmission,
    item.vehicleColour,
    item.year,
    item.vehicleYear,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();
}

function listingMatchesSearch(item: Record<string, unknown>, query: string): boolean {
  const haystack = vehicleSearchText(item);
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 1);
  if (words.length === 0) return true;
  return words.every((w) => haystack.includes(w));
}

`;

const COMPONENT_START = readFileSync(join(root, "scripts/_1509_big_new.txt"), "utf8")
  .replace(
    `  const checkWatchlist = (id: string) => {
    void watchlistTick;
    return isInWatchlist(id);
  };`,
    ""
  )
  .replace(
    `async function toggleWatchlist(item: any) {
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
    }
    setWatchlistTick((t) => t + 1);
  }`,
    `async function toggleWatchlist(item: any) {
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

  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);

  useEffect(() => {
    const refreshRecentlyViewed = () => setRecentlyViewed(getRecentlyViewed());
    refreshRecentlyViewed();
    window.addEventListener("focus", refreshRecentlyViewed);
    return () => window.removeEventListener("focus", refreshRecentlyViewed);
  }, []);`
  );

// Extract JSX body from chain (from cityOptions through end, skipping broken top)
const jsxStart = chain.indexOf("  const cityOptions = useMemo");
const jsxEnd = chain.lastIndexOf("        ) : (");
const middle = chain.slice(jsxStart, jsxEnd);

const LISTING_GRID = `        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5 mt-4">
              <div className="flex items-center gap-3">
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-yellow-500 to-amber-500" />
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white">Vehicle Listings</h2>
                  <p className="text-[11px] text-zinc-500">
                    {filteredListings.length} vehicle{filteredListings.length !== 1 ? "s" : ""} found
                    {searchQuery.trim() ? \` matching "\${searchQuery.trim()}"\` : ""}
                    {selectedRegion !== "All" ? \` · \${selectedRegion}\` : ""}
                    {selectedCity !== "All" ? \` · \${selectedCity}\` : ""}
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
                  accent="yellow"
                  user={user}
                  isInWatchlist={isInWatchlist}
                  onToggleWatchlist={toggleWatchlist}
                  onCardClick={() => {
                    saveRecentlyViewed(item);
                    router.push(\`/post/listing/\${item.id}\`);
                  }}
                  onBuyNow={handleBuyNow}
                  onMakeOffer={(listing) => router.push(\`/post/listing/\${listing.id}\`)}
                  sellerReviewStats={sellerReviewStats}
                  sellerBadges={sellerBadges}
                />
              ))}
            </div>
          </>
        )}

        {vehicleRecentlyViewed.length > 0 && (
          <div className="mt-10">
            <div className="relative mb-3 pt-2">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
              <div className="flex items-center gap-2 pt-3">
                <div className="h-5 w-1 rounded-full bg-gradient-to-b from-yellow-500 to-amber-500" />
                <p className="text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">
                  Recently Viewed
                </p>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {vehicleRecentlyViewed.map((item: any) => {
                const live = listings.find((l) => l.id === item.id);
                const card = live ? { ...item, ...live } : item;
                const imageSrc = card.images?.[0] || card.imageUrl || card.image;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      saveRecentlyViewed(card);
                      router.push(\`/post/listing/\${item.id}\`);
                    }}
                    className="group w-56 shrink-0 cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-yellow-500/40 hover:shadow-[0_8px_25px_rgba(234,179,8,0.15)]"
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
                      <div className="flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500/10 to-amber-500/10 text-2xl">
                        🚗
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-bold text-[var(--cream)]">{card.title}</p>
                    <p className="text-sm font-black text-yellow-400">\${card.price}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}`;

let out =
  HEADER +
  COMPONENT_START +
  "\n" +
  middle +
  LISTING_GRID +
  `
      </section>
    </main>
  );
}
`;

out = out
  .replace(/blue-500/g, "yellow-500")
  .replace(/blue-400/g, "yellow-400")
  .replace(/indigo-500/g, "amber-500")
  .replace(/indigo-400/g, "amber-400")
  .replace(/from-blue-400 to-amber-400/g, "from-yellow-400 to-amber-400")
  .replace(/rgba\(59,130,246/g, "rgba(234,179,8")
  .replace(/from-blue-900\/20 to-indigo-900\/20/g, "from-yellow-900/20 to-amber-900/20");

writeFileSync(join(root, "app/vehicles/page.tsx"), out, "utf8");
console.log("Lines:", out.split(/\r?\n/).length);
