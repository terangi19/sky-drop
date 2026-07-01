"use client";

import type { CSSProperties } from "react";
import { useState, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { User } from "firebase/auth";
import { cdnUrl } from "../lib/cdn";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { timeAgo } from "../lib/listing-card-utils";
import {
  listingWatchlistCount,
  listingWatchlistGlowIntensity,
} from "../lib/listing-watchlist-count";
import { SellerReviewSummary } from "./SellerReviewStars";

export type MarketplaceListingCardProps = {
  item: Record<string, any>;
  cardIndex?: number;
  user: User | null;
  isInWatchlist: (id: string) => boolean;
  onToggleWatchlist: (item: Record<string, any>) => void;
  onCardClick: () => void;
  onBuyNow: (item: Record<string, any>) => void;
  onMakeOffer: (item: Record<string, any>) => void;
  sellerReviewStats: Record<string, { avg: number; count: number }>;
  sellerBadges: Record<string, string>;
  sellerFullyVerified?: Record<string, boolean>;
  sellerJoinedDate?: Record<string, string>;
  sellerListingCount?: Record<string, number>;
  onPromote?: (item: Record<string, any>) => void;
  onDelete?: (item: Record<string, any>) => void;
  accent?: "sky" | "sky" | "sky";
  /** Homepage-style neon blue card glow */
  neonGlow?: boolean;
  loading?: boolean;
};

const IMG_BADGE = "lc-img-badge rounded-full px-2.5 py-0.5 text-[9px] font-bold";

function listingCardGlowStyle(
  saveGlow: number,
  isPopular: boolean,
  isVisible: boolean,
  neonGlow?: boolean
): CSSProperties | undefined {
  const glow = Math.max(saveGlow, isPopular ? 0.35 : 0, neonGlow ? 0.3 : 0);
  if (!neonGlow && !isVisible) return undefined;
  if (!neonGlow && glow < 0.05) return undefined;

  if (neonGlow) {
    return {
      borderColor: `rgba(56, 189, 248, ${0.5 + glow * 0.35})`,
      backgroundImage: `linear-gradient(to bottom, rgba(56, 189, 248, ${0.06 + glow * 0.12}), transparent)`,
    };
  }

  return {
    borderColor: `rgba(56, 189, 248, ${0.12 + glow * 0.45})`,
    boxShadow: `0 0 ${Math.round(10 + glow * 50)}px rgba(56, 189, 248, ${0.08 + glow * 0.38})`,
    backgroundImage: `linear-gradient(to bottom, rgba(56, 189, 248, ${0.02 + glow * 0.07}), transparent)`,
  };
}

function watchlistBadgeStyle(saveGlow: number): CSSProperties {
  return {
    borderColor: `rgba(56, 189, 248, ${0.22 + saveGlow * 0.55})`,
    boxShadow: `0 0 ${Math.round(6 + saveGlow * 20)}px rgba(56, 189, 248, ${0.18 + saveGlow * 0.5})`,
    textShadow: `0 0 ${Math.round(4 + saveGlow * 12)}px rgba(56, 189, 248, ${0.35 + saveGlow * 0.55})`,
  };
}

export default memo(function MarketplaceListingCard({
  item,
  cardIndex = 0,
  user,
  isInWatchlist,
  onToggleWatchlist,
  onCardClick,
  onBuyNow,
  onMakeOffer,
  sellerReviewStats,
  sellerBadges,
  sellerFullyVerified = {},
  sellerJoinedDate = {},
  sellerListingCount = {},
  onPromote,
  onDelete,
  accent = "sky",
  neonGlow = true,
  loading = false,
}: MarketplaceListingCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const themed = accent === "sky" || accent === "sky";
  const isVisible = isListingVisibleInMarketplace(item);
  const saves = themed ? listingWatchlistCount(item) : 0;
  const saveGlow = listingWatchlistGlowIntensity(saves);
  const isPopular = isVisible && (item.views || 0) > 3;
  const imageSrc = item.thumbnails?.[0] || item.images?.[0]?.thumbnail || item.images?.[0] || item.imageUrl || item.image;

  const cardGlowStyle = listingCardGlowStyle(saveGlow, isPopular, isVisible, neonGlow);
  const categoryLabel =
    item.type === "vehicle"
      ? "Cars"
      : item.category || "Other";
  const offerCategory =
    item.category === "Cars" || item.category === "Property";

  return (
    <div className="relative h-full">
      <div
        className={`listing-card group relative z-[1] flex h-full flex-col overflow-hidden rounded-2xl border cursor-pointer animate-fade-in-up hover:-translate-y-1 ${neonGlow ? "listing-card--neon" : ""}`}
        style={{
          animationDelay: `${Math.min(cardIndex, 10) * 40}ms`,
          ...cardGlowStyle,
        }}
        onClick={onCardClick}
      >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent ${
          neonGlow ? "to-sky-500/[0.06]" : "to-sky-500/[0.02]"
        }`}
      />

      {imageSrc ? (
        <>
          <div className="relative shrink-0 overflow-hidden aspect-[4/3]">
            <Image
              src={cdnUrl(imageSrc)}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-all duration-500 group-hover:scale-105 opacity-0"
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.opacity = "1";
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {!isVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-lg">
                  {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                </span>
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {isVisible && isPopular && (
                <span className={IMG_BADGE}>🔥 Hot</span>
              )}
              {isVisible && themed && saves >= 2 && (
                <span className={IMG_BADGE}>⭐ Popular</span>
              )}
              {item.promotedUntil?.toMillis?.() > Date.now() && (
                <span className={IMG_BADGE}>📈 Promoted</span>
              )}
              {isVisible &&
                item.createdAt?.seconds &&
                Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                  <span className={IMG_BADGE}>New</span>
                )}
              {isVisible &&
                item.saleType &&
                String(item.saleType).includes("auction") && (
                  <span className={IMG_BADGE}>⏰ Auction</span>
                )}
              {item.type === "digital" && isVisible && (
                <span className={IMG_BADGE}>📥 Digital</span>
              )}
              {item.type === "vehicle" && isVisible && (
                <span className={IMG_BADGE}>🚗 Vehicle</span>
              )}
            </div>
            {themed && isVisible && (
              <div
                className="lc-saves-badge absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={watchlistBadgeStyle(saveGlow)}
              >
                ⭐ {saves.toLocaleString()} {saves === 1 ? "save" : "saves"}
              </div>
            )}
            {isVisible && item.images?.length > 1 && (
              <div className="absolute top-3 right-3">
                <span className="lc-img-overlay-badge lc-on-image rounded-full px-2 py-0.5 text-[9px] font-medium">
                  📷 {item.images.length}
                </span>
              </div>
            )}
            {isVisible && item.expiresAt?.toMillis?.() < Date.now() && (
              <div className="absolute top-3 right-3">
                <span className="lc-img-overlay-badge lc-on-image rounded-full px-2.5 py-0.5 text-[9px] font-bold">
                  Expired
                </span>
              </div>
            )}
            {item.images?.length > 1 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 justify-center gap-1.5">
                {item.images.slice(0, 5).map((_: string, i: number) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      i === 0 ? "w-4 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.45)]" : "w-1 bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="lc-placeholder relative aspect-[4/3] shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="lc-title text-3xl font-black tracking-tighter mb-1">SD</div>
              <div className="lc-meta text-[10px] uppercase tracking-widest">Sky Drop</div>
            </div>
          </div>
          {!isVisible && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-lg">
                {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
              </span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {isVisible &&
              item.createdAt?.seconds &&
              Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                <span className={IMG_BADGE}>New</span>
              )}
            {isVisible &&
              item.saleType &&
              String(item.saleType).includes("auction") && (
                <span className={IMG_BADGE}>⏰ Auction</span>
              )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <span className={`lc-chip rounded-md px-2 py-0.5 text-[10px] font-semibold`}>
              {categoryLabel}
            </span>
            {item.promotedUntil?.toMillis?.() > Date.now() && (
              <span className="lc-chip rounded-md px-2 py-0.5 text-[10px] font-semibold">
                📈 Promoted
              </span>
            )}
            {item.condition && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  item.condition === "New" ? "lc-chip" : "lc-chip-neutral"
                }`}
              >
                {item.condition === "New" ? "🆕 New" : item.condition}
              </span>
            )}
            {item.type === "vehicle" && (item.vehicleYear || item.year) && (
              <span className="lc-chip-neutral rounded-md px-2 py-0.5 text-[10px] font-semibold">
                {item.vehicleYear || item.year}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(item);
            }}
            className={`lc-watchlist relative text-base transition-all duration-200 hover:scale-110 active:scale-95 ${
              isInWatchlist(item.id) ? "lc-watchlist--active" : ""
            }`}
          >
            {isInWatchlist(item.id) ? "❤️" : "♡"}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2.5">
          <h2 className="lc-title flex-1 line-clamp-1 text-[17px] font-black tracking-tight">
            {item.title}
          </h2>
        </div>

        <p className="lc-desc mt-1.5 line-clamp-2 text-[12px] leading-relaxed">
          {item.description ||
            [
              item.vehicleMake && item.vehicleModel
                ? `${item.vehicleMake} ${item.vehicleModel}`
                : item.make && item.model
                  ? `${item.make} ${item.model}`
                  : "",
              item.vehicleOdometer != null && item.vehicleOdometer !== ""
                ? `${Number(item.vehicleOdometer).toLocaleString()} km`
                : item.odometer != null
                  ? `${Number(item.odometer).toLocaleString()} km`
                  : "",
              item.vehicleFuelType || item.fuelType,
              item.vehicleTransmission || item.transmission,
            ]
              .filter(Boolean)
              .join(" · ")}
        </p>

        <div className="mt-3 flex items-baseline gap-2">
          {item.pricingType === "quote" ? (
            <>
              <p className="lc-price text-2xl font-black tracking-tight">Contact Seller for Quote</p>
              <span className="lc-quote-badge rounded-full px-2 py-0.5 text-[9px] font-bold">Quote Required</span>
            </>
          ) : (
            <p className="lc-price text-2xl font-black tracking-tight">${item.price}</p>
          )}
          {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
            <span className="lc-bid rounded-md px-2 py-0.5 text-sm font-bold">
              Bid: ${item.currentBid || item.startingBid || 0}
            </span>
          )}
        </div>

        <div className="lc-meta mt-3 flex min-h-5 items-center gap-3 text-[11px]">
          {item.location && (
            <span className="flex items-center gap-1">📍 {item.location}</span>
          )}
          {item.createdAt?.seconds != null && <span>{timeAgo(item.createdAt.seconds)}</span>}
          {item.pickupAvailable && <span>📍 Pickup</span>}
          {item.shippingAvailable && <span>📦 Shipping</span>}
          {themed ? (
            <span
              className={`lc-accent ml-auto flex items-center gap-1 font-semibold`}
              style={
                saveGlow > 0.2
                  ? { textShadow: `0 0 ${Math.round(4 + saveGlow * 10)}px rgba(56, 189, 248, ${saveGlow * 0.55})` }
                  : undefined
              }
            >
              ⭐ {saves.toLocaleString()} {saves === 1 ? "save" : "saves"}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              👁 {(item.views as number) || 0}
            </span>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-3">
        <div className="flex min-h-10 gap-2">
          {user && user.email !== item.sellerEmail && (
            <>
              {offerCategory && item.acceptOffers ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMakeOffer(item);
                    }}
                    disabled={loading}
                    className={`lc-btn flex-1 rounded-md py-2.5 text-[12px] font-semibold active:scale-95 ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                        Processing...
                      </span>
                    ) : (
                      "Make Offer"
                    )}
                  </button>
                  {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                    <Link
                      href={`/post/listing/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`lc-btn flex flex-1 items-center justify-center rounded-md py-2.5 text-[12px] font-semibold active:scale-95`}
                    >
                      Bid Now
                    </Link>
                  )}
                </>
              ) : item.pricingType === "quote" ? (
                <>
                  <Link
                    href={`/post/listing/${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="lc-btn flex flex-1 items-center justify-center rounded-md py-2.5 text-[12px] font-semibold active:scale-95"
                  >
                    Request Quote
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBuyNow(item);
                    }}
                    disabled={loading}
                    className={`lc-btn flex-1 rounded-md py-2.5 text-[12px] font-semibold active:scale-95 ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
                    title={item.paymentType === "contact" ? "Arrange payment directly with seller (bank transfer, cash, etc.)" : "Pay instantly with credit card via Stripe"}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                        Processing...
                      </span>
                    ) : (
                      item.paymentType === "contact" ? "Arrange Purchase" : "Buy Now"
                    )}
                  </button>
                  {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                    <Link
                      href={`/post/listing/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`lc-btn flex flex-1 items-center justify-center rounded-md py-2.5 text-[12px] font-semibold active:scale-95`}
                    >
                      Bid Now
                    </Link>
                  )}
                  {item.acceptOffers && item.paymentType !== "contact" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onMakeOffer(item);
                      }}
                      className="lc-link ml-1 text-[11px]"
                    >
                      Offer
                    </button>
                  )}
                </>
              )}

              <Link
                href={`/post/listing/${item.id}#contact`}
                onClick={(e) => e.stopPropagation()}
                className="lc-btn-ghost flex flex-1 items-center justify-center rounded-md py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Message
              </Link>
            </>
          )}
          {user && user.email === item.sellerEmail && onPromote && onDelete && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPromote(item);
                }}
                className="lc-btn rounded-md px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                📈 Boost
              </button>
              <Link
                href={`/post/ai?edit=${item.id}`}
                onClick={(e) => e.stopPropagation()}
                className="lc-btn rounded-md px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="lc-btn-ghost rounded-md px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Remove
              </button>
            </>
          )}
        </div>

        <Link
          href={
            user?.email === item.sellerEmail
              ? "#"
              : `/seller/${item.sellerUsername || item.sellerEmail}`
          }
          onClick={(e) => e.stopPropagation()}
          className="block hover:cursor-pointer"
        >
          {(() => {
            const email = item.sellerEmail;
            const username = item.sellerUsername || email?.split("@")[0] || "—";
            const initial = username.charAt(0).toUpperCase();
            const stats = sellerReviewStats[email || ""];
            const avgRating = stats ? stats.avg : 0;
            const reviewCount = stats ? stats.count : 0;
            const joinedDate = sellerJoinedDate[email || ""] || "";
            const listingCount = sellerListingCount[email || ""] || 0;
            const isVerified = sellerFullyVerified?.[email || ""];
            
            // Format joined date to "Jan 2024" format
            const formatDate = (dateStr: string) => {
              if (!dateStr) return "";
              try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' });
              } catch {
                return "";
              }
            };
            
            return (
              <div className="lc-seller group rounded-lg p-3 hover:-translate-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="lc-avatar relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ring-1">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="lc-seller-name truncate text-[14px] font-semibold">
                        {username}
                      </span>
                      {isVerified && (
                        <span className="lc-chip rounded px-1.5 py-0.5 text-[9px] font-bold">
                          ✓ Verified
                        </span>
                      )}
                      {sellerBadges[email || ""] === "legendary" && (
                        <span className="lc-chip rounded border px-1.5 py-0.5 text-[9px] font-bold animate-pulse">
                          👑 The Five
                        </span>
                      )}
                      {sellerBadges[email || ""] === "epic" && (
                        <span className="lc-chip rounded border px-1.5 py-0.5 text-[9px] font-bold">
                          💎 Epic
                        </span>
                      )}
                    </div>
                    <div className="lc-seller-meta flex items-center gap-2 text-[11px] mt-0.5">
                      {formatDate(joinedDate) && <span>Joined {formatDate(joinedDate)}</span>}
                      {listingCount > 0 && (
                        <Link
                          href={`/seller/${username}?listings`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline hover:text-[var(--lc-accent)] transition-colors"
                        >
                          • {listingCount} {listingCount === 1 ? 'listing' : 'listings'}
                        </Link>
                      )}
                      {reviewCount > 0 && <span>• {avgRating.toFixed(1)}★ ({reviewCount})</span>}
                      {reviewCount === 0 && <span>• New to Sky Drop</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="lc-seller-link text-[10px]">View profile</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </Link>
        </div>
      </div>
    </div>
    
    {showDeleteConfirm && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
        <div className="mx-4 max-w-sm rounded-2xl border border-zinc-700/50 bg-zinc-900/95 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-xl font-bold text-white">Delete Listing?</h3>
          <p className="mt-2 text-sm text-zinc-400">Are you sure you want to delete "{item.title}"? This action cannot be undone.</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(item);
              }}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
});
