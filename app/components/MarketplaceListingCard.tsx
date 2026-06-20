"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import Link from "next/link";
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
  onPromote?: (item: Record<string, any>) => void;
  onDelete?: (item: Record<string, any>) => void;
  accent?: "sky" | "sky" | "sky";
  /** Homepage-style neon blue card glow */
  neonGlow?: boolean;
};

const CREAM_CARD =
  "border-[rgba(255,248,231,0.08)] bg-white/[0.02] hover:border-[#6b8e6b]/40 hover:bg-white/[0.03] hover:shadow-[0_0_30px_rgba(107,142,107,0.22),0_0_60px_rgba(107,142,107,0.12)]";
const NEON_BLUE_CARD =
  "border-[#6b8e6b]/50 bg-white/[0.02] hover:border-[#5a7a5a]/70 hover:bg-[#6b8e6b]/[0.06] hover:shadow-[0_0_30px_rgba(107,142,107,0.22),0_0_60px_rgba(107,142,107,0.12)]";
const CREAM_CHIP =
  "border-[rgba(255,248,231,0.14)] bg-[rgba(255,248,231,0.08)] text-[var(--cream)]";
const CREAM_BTN =
  "border-[rgba(255,248,231,0.22)] bg-[rgba(255,248,231,0.06)] text-[var(--cream)] hover:border-[rgba(255,248,231,0.38)] hover:bg-[rgba(255,248,231,0.12)] hover:text-[var(--cream)]";
const CREAM_BADGE =
  "rounded-full bg-[rgba(255,248,231,0.18)] px-2.5 py-0.5 text-[9px] font-bold text-[var(--cream)] backdrop-blur-sm";

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
    borderColor: `rgba(255, 248, 231, ${0.12 + glow * 0.45})`,
    boxShadow: `0 0 ${Math.round(10 + glow * 50)}px rgba(255, 248, 231, ${0.08 + glow * 0.38})`,
    backgroundImage: `linear-gradient(to bottom, rgba(255, 248, 231, ${0.02 + glow * 0.07}), transparent)`,
  };
}

function watchlistBadgeStyle(saveGlow: number): CSSProperties {
  return {
    borderColor: `rgba(255, 248, 231, ${0.22 + saveGlow * 0.55})`,
    backgroundColor: `rgba(0, 0, 0, ${0.45 + saveGlow * 0.2})`,
    color: `rgba(255, 253, 245, ${0.8 + saveGlow * 0.2})`,
    boxShadow: `0 0 ${Math.round(6 + saveGlow * 20)}px rgba(255, 248, 231, ${0.18 + saveGlow * 0.5})`,
    textShadow: `0 0 ${Math.round(4 + saveGlow * 12)}px rgba(255, 248, 231, ${0.35 + saveGlow * 0.55})`,
  };
}

export default function MarketplaceListingCard({
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
  onPromote,
  onDelete,
  accent = "sky",
  neonGlow = true,
}: MarketplaceListingCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const themed = accent === "sky" || accent === "sky";
  const isVisible = isListingVisibleInMarketplace(item);
  const saves = themed ? listingWatchlistCount(item) : 0;
  const saveGlow = listingWatchlistGlowIntensity(saves);
  const isPopular = isVisible && (item.views || 0) > 3;
  const imageSrc = item.images?.[0] || item.imageUrl || item.image;

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
        className={`listing-card group relative z-[1] flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer animate-fade-in-up hover:-translate-y-1 text-[var(--cream)] ${neonGlow ? NEON_BLUE_CARD : CREAM_CARD}`}
        style={{
          animationDelay: `${Math.min(cardIndex, 10) * 40}ms`,
          ...cardGlowStyle,
        }}
        onClick={onCardClick}
      >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent ${
          neonGlow ? "to-sky-500/[0.06]" : "to-[rgba(255,248,231,0.02)]"
        }`}
      />

      {imageSrc ? (
        <>
          <div className="relative shrink-0 overflow-hidden">
            <img
              src={cdnUrl(imageSrc)}
              alt={item.title}
              loading="lazy"
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.opacity = "1";
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
              className="aspect-[4/3] w-full object-cover transition-all duration-500 group-hover:scale-105 opacity-0"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            {!isVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--cream)] shadow-lg">
                  {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                </span>
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {isVisible && isPopular && (
                <span className={CREAM_BADGE}>🔥 Hot</span>
              )}
              {isVisible && themed && saves >= 2 && (
                <span className={CREAM_BADGE}>⭐ Popular</span>
              )}
              {item.promotedUntil?.toMillis?.() > Date.now() && (
                <span className={CREAM_BADGE}>📈 Promoted</span>
              )}
              {isVisible &&
                item.createdAt?.seconds &&
                Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                  <span className={CREAM_BADGE}>New</span>
                )}
              {isVisible &&
                item.saleType &&
                String(item.saleType).includes("auction") && (
                  <span className={CREAM_BADGE}>⏰ Auction</span>
                )}
              {item.type === "digital" && isVisible && (
                <span className={CREAM_BADGE}>📥 Digital</span>
              )}
              {item.type === "vehicle" && isVisible && (
                <span className={CREAM_BADGE}>🚗 Vehicle</span>
              )}
            </div>
            {themed && isVisible && (
              <div
                className="absolute bottom-3 right-3 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur-md"
                style={watchlistBadgeStyle(saveGlow)}
              >
                ⭐ {saves.toLocaleString()} {saves === 1 ? "save" : "saves"}
              </div>
            )}
            {isVisible && item.images?.length > 1 && (
              <div className="absolute top-3 right-3">
                <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-[var(--cream)] backdrop-blur-sm">
                  📷 {item.images.length}
                </span>
              </div>
            )}
            {isVisible && item.expiresAt?.toMillis?.() < Date.now() && (
              <div className="absolute top-3 right-3">
                <span className="rounded-full bg-zinc-800/90 px-2.5 py-0.5 text-[9px] font-bold text-[var(--cream)] backdrop-blur-sm">
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
                      i === 0 ? "w-4 bg-[#fff8e7] shadow-[0_0_8px_rgba(255,248,231,0.45)]" : "w-1 bg-zinc-700"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="relative aspect-[4/3] shrink-0 flex items-center justify-center bg-gradient-to-br from-zinc-800/50 via-zinc-800/30 to-zinc-800/50">
          <div className="absolute inset-0 flex items-center justify-center text-[var(--cream)]">
            <div className="text-center">
              <div className="text-3xl font-black tracking-tighter mb-1">SD</div>
              <div className="text-[10px] uppercase tracking-widest opacity-50">Sky Drop</div>
            </div>
          </div>
          {!isVisible && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[var(--cream)] shadow-lg">
                {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
              </span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {isVisible &&
              item.createdAt?.seconds &&
              Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                <span className={CREAM_BADGE}>New</span>
              )}
            {isVisible &&
              item.saleType &&
              String(item.saleType).includes("auction") && (
                <span className={CREAM_BADGE}>⏰ Auction</span>
              )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold text-always-white ${CREAM_CHIP}`}>
              {categoryLabel}
            </span>
            {item.promotedUntil?.toMillis?.() > Date.now() && (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${CREAM_CHIP}`}>
                📈 Promoted
              </span>
            )}
            {item.condition && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                  item.condition === "New" ? CREAM_CHIP : "border-zinc-700/30 bg-zinc-800/60 text-[var(--cream)]"
                }`}
              >
                {item.condition === "New" ? "🆕 New" : item.condition}
              </span>
            )}
            {item.type === "vehicle" && (item.vehicleYear || item.year) && (
              <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] font-semibold text-[var(--cream)] border border-zinc-700/30">
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
            className={`relative text-base transition-all duration-200 hover:scale-110 active:scale-95 ${
              isInWatchlist(item.id) ? "text-[var(--cream)]" : "text-[var(--cream)] hover:text-[var(--cream)]"
            }`}
          >
            {isInWatchlist(item.id) ? "❤️" : "♡"}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2.5">
          <h2 className="flex-1 line-clamp-1 text-[17px] font-black tracking-tight text-always-white">
            {item.title}
          </h2>
        </div>

        <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-always-white">
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
              <p className="text-2xl font-black tracking-tight text-[var(--cream)]">Contact Seller for Quote</p>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-400">Quote Required</span>
            </>
          ) : (
            <p className="text-2xl font-black tracking-tight text-[var(--cream)]">${item.price}</p>
          )}
          {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
            <span className="text-sm font-bold text-[var(--cream)]">
              Bid: ${item.currentBid || item.startingBid || 0}
            </span>
          )}
        </div>

        <div className="mt-3 flex min-h-5 items-center gap-3 text-[11px] text-[var(--cream)]">
          {item.location && (
            <span className="flex items-center gap-1">📍 {item.location}</span>
          )}
          {item.createdAt?.seconds != null && <span>{timeAgo(item.createdAt.seconds)}</span>}
          {item.pickupAvailable && <span>📍 Pickup</span>}
          {item.shippingAvailable && <span>📦 Shipping</span>}
          {themed ? (
            <span
              className={`ml-auto flex items-center gap-1 font-semibold ${
                saveGlow > 0.1 ? "text-[var(--cream)]" : "text-[var(--cream)]"
              }`}
              style={
                saveGlow > 0.2
                  ? { textShadow: `0 0 ${Math.round(4 + saveGlow * 10)}px rgba(255, 248, 231, ${saveGlow * 0.55})` }
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
                    className={`flex-1 rounded-md border py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
                  >
                    Make Offer
                  </button>
                  {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                    <Link
                      href={`/post/listing/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`flex flex-1 items-center justify-center rounded-md border py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
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
                    className={`flex flex-1 items-center justify-center rounded-md border py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
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
                    className={`flex-1 rounded-md border py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
                  >
                    {item.paymentType === "contact" ? "Purchase" : "Buy Now"}
                  </button>
                  {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                    <Link
                      href={`/post/listing/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`flex flex-1 items-center justify-center rounded-md border py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
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
                      className="ml-1 text-[11px] text-[var(--cream)] underline underline-offset-2 hover:text-[var(--cream)]"
                    >
                      Offer
                    </button>
                  )}
                </>
              )}

              <Link
                href={`/post/listing/${item.id}#contact`}
                onClick={(e) => e.stopPropagation()}
                className="flex flex-1 items-center justify-center rounded-md border border-zinc-700/30 py-2.5 text-[12px] font-semibold text-[var(--cream)] transition-all duration-150 hover:border-zinc-600/50 hover:text-[var(--cream)] active:scale-95"
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
                className={`rounded-md border px-4 py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
              >
                📈 Boost
              </button>
              <Link
                href={`/post/ai?edit=${item.id}`}
                onClick={(e) => e.stopPropagation()}
                className={`rounded-md border px-4 py-2.5 text-[12px] font-semibold transition-all duration-150 active:scale-95 ${CREAM_BTN}`}
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="rounded-md bg-zinc-800/60 px-4 py-2.5 text-[12px] font-semibold text-[var(--cream)] transition-all duration-150 hover:bg-zinc-700 active:scale-95"
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
            return (
              <div className="group rounded-lg border border-[rgba(255,248,231,0.1)] bg-zinc-800/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(255,248,231,0.28)] hover:bg-zinc-800/30">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(255,248,231,0.14)] text-[13px] font-bold text-[var(--cream)] ring-1 ring-[rgba(255,248,231,0.2)]">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[14px] font-semibold text-[var(--cream)]">
                        {username}
                      </span>
                      {sellerFullyVerified?.[email || ""] && (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold border-sky-500/30 bg-sky-500/10 text-sky-400`}>
                          ✓ Verified
                        </span>
                      )}
                      {sellerBadges[email || ""] === "legendary" && (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold animate-pulse ${CREAM_CHIP}`}>
                          👑 The Five
                        </span>
                      )}
                      {sellerBadges[email || ""] === "epic" && (
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${CREAM_CHIP}`}>
                          💎 Epic
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[var(--cream)]">
                      <SellerReviewSummary avg={avgRating} count={reviewCount} starSize="xs" ratingClassName="text-[var(--cream)]" countClassName="text-[var(--cream)]" emptyLabel="No reviews yet" />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-[var(--cream)]">View profile</p>
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
}
