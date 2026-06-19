"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { cdnUrl } from "../lib/cdn";
import { ARRANGE_PURCHASE_CARD_LABEL } from "../lib/arrange-purchase-copy";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { timeAgo } from "../lib/listing-card-utils";
import {
  listingWatchlistCount,
  listingWatchlistGlowIntensity,
} from "../lib/listing-watchlist-count";
import { sellerProfileDisplayName, sellerProfileSlug } from "../lib/public-display";
import { SellerReviewSummary } from "./SellerReviewStars";
import ServicePricingBadge from "./ServicePricingBadge";
import { formatServicePriceDisplay } from "../lib/service-pricing";

export type ListingCardProps = {
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
  sellerHandles?: Record<string, string>;
  sellerFullyVerified?: Record<string, boolean>;
  onPromote?: (item: Record<string, any>) => void;
  onDelete?: (item: Record<string, any>) => void;
};

export default function ListingCard({
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
  sellerHandles = {},
  sellerFullyVerified = {},
  onPromote,
  onDelete,
}: ListingCardProps) {
  const isVisible = isListingVisibleInMarketplace(item);
  const imageSrc = item.images?.[0] || item.imageUrl || item.image;
  const isOwner = user?.email === item.sellerEmail;
  const [showTrustLegend, setShowTrustLegend] = useState(false);

  const categoryLabel =
    item.type === "vehicle" ? "Cars" : item.category || "Other";
  const offerCategory = item.category === "Cars" || item.category === "Property";

  return (
    <div className="group h-full">
        <div
          role="button"
          tabIndex={0}
          aria-label={`View listing: ${item.title}. ${item.price ? `Price: $${item.price}.` : ''} ${categoryLabel} in ${item.condition || 'unknown condition'}`}
          aria-describedby={`listing-card-${item.id}-details`}
          className="listing-card relative z-[1] flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-sm transition-all duration-300 animate-fade-in-up hover:-translate-y-1.5 hover:border-[#6b8e6b]/40 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(107,142,107,0.22),0_0_60px_rgba(107,142,107,0.12)] active:-translate-y-0.5 active:scale-[0.985] active:border-[#5a7a5a]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b8e6b]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0f]"
          style={{
            animationDelay: `${Math.min(cardIndex, 10) * 40}ms`,
          }}
          onClick={onCardClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCardClick();
            }
          }}
        >
          {/* Image section */}
          {imageSrc ? (
            <div className="relative shrink-0 overflow-hidden bg-zinc-900">
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
                className="aspect-[4/3] w-full object-cover opacity-0 transition-all duration-700 group-hover:scale-105 group-hover:rotate-1"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {!isVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                  <span className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 px-5 py-2 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-red-500/30">
                    {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                  </span>
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                {isVisible && (item.views || 0) > 3 && (
                  <span className="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-orange-500/30 backdrop-blur-sm animate-pulse">
                    🔥 Hot
                  </span>
                )}
                {item.promotedUntil?.toMillis?.() > Date.now() && (
                  <span className="rounded-full bg-gradient-to-r from-purple-500 to-purple-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-purple-500/30 backdrop-blur-sm">
                    📈 Promoted
                  </span>
                )}
                {isVisible && item.createdAt?.seconds && Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                  <span className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-emerald-500/30 backdrop-blur-sm">
                    New
                  </span>
                )}
                {isVisible && String(item.saleType || "").includes("auction") && (
                  <span className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-amber-500/30 backdrop-blur-sm">
                    ⏰ Auction
                  </span>
                )}
                {item.type === "digital" && isVisible && (
                  <span className="rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-cyan-500/30 backdrop-blur-sm">
                    📥 Digital
                  </span>
                )}
                {item.type === "vehicle" && isVisible && (
                  <span className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-blue-500/30 backdrop-blur-sm">
                    🚗 Vehicle
                  </span>
                )}
                {isVisible && item.expiresAt?.toMillis?.() < Date.now() && (
                  <span className="rounded-full bg-zinc-700/90 px-2.5 py-0.5 text-[9px] font-bold text-white/80 backdrop-blur-sm">
                    Expired
                  </span>
                )}
              </div>

              {/* Multi-image dots */}
              {item.images?.length > 1 && (
                <div className="absolute bottom-3 right-3">
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                    📷 {item.images.length}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative aspect-[4/3] shrink-0 flex items-center justify-center bg-gradient-to-br from-zinc-800/40 via-zinc-800/20 to-zinc-800/40">
              <div className="text-center">
                <div className="text-3xl font-black tracking-tighter text-white mb-1">SD</div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">Sky Drop</div>
              </div>
              {!isVisible && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                  <span className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 px-5 py-2 text-xs font-black uppercase tracking-widest text-white shadow-xl">
                    {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            {/* Category chip + watchlist */}
            <div className="flex min-h-7 items-start justify-between gap-2">
              <div className="flex gap-1.5 flex-wrap">
                <span className="inline-flex items-center rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-always-white">
                  {categoryLabel}
                </span>
                {item.condition && (
                  <span className="inline-flex items-center rounded-md border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[9px] font-semibold text-white/70">
                    {item.condition === "New" ? "🆕 New" : item.condition}
                  </span>
                )}
                {item.type === "vehicle" && (item.vehicleYear || item.year) && (
                  <span className="inline-flex items-center rounded-md border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[9px] font-semibold text-white/70">
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
                aria-label={isInWatchlist(item.id) ? `Remove ${item.title} from watchlist` : `Add ${item.title} to watchlist`}
                aria-pressed={isInWatchlist(item.id)}
                className="relative shrink-0 text-base opacity-60 transition-all duration-200 hover:opacity-100 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              >
                {isInWatchlist(item.id) ? (
                  <span>❤️</span>
                ) : (
                  <span className="text-white/60">♡</span>
                )}
              </button>
            </div>

            {/* Title */}
            <h2 className="mt-2.5 line-clamp-1 text-base font-bold tracking-tight text-always-white">
              {item.title}
            </h2>

            {/* Description / meta */}
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

            {/* Price */}
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {item.type === "service" ? (
                <>
                  <ServicePricingBadge listing={item} size="sm" />
                  <p className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow-lg">
                    {formatServicePriceDisplay(item)}
                  </p>
                </>
              ) : item.pricingType === "quote" ? (
                <>
                  <p className="text-lg sm:text-xl font-bold tracking-tight text-white/90">Contact for Quote</p>
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">Quote Required</span>
                </>
              ) : (
              <p className="text-3xl sm:text-4xl font-black tracking-tight text-white drop-shadow-lg">
                ${item.price}
              </p>
              )}
              {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                <span className="rounded-lg bg-amber-500/20 px-2 py-1 text-sm font-bold text-amber-400 border border-amber-500/30">
                  Bid: ${item.currentBid || item.startingBid || 0}
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/70">
              {item.location && (
                <span className="inline-flex items-center gap-1">📍 {item.location}</span>
              )}
              {item.createdAt?.seconds != null && (
                <span>{timeAgo(item.createdAt.seconds)}</span>
              )}
              {item.pickupAvailable && <span>📍 Pickup</span>}
              {item.shippingAvailable && <span>📦 Shipping</span>}
              <span className="ml-auto inline-flex items-center gap-1">
                👁 {(item.views as number) || 0}
              </span>
            </div>

            <div className="mt-auto space-y-4 pt-4">
            {/* Actions */}
            <div className="flex min-h-10 gap-2">
              {user && !isOwner && (
                <>
                  {offerCategory && item.acceptOffers ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMakeOffer(item);
                        }}
                        className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]"
                      >
                        Make Offer
                      </button>
                      {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                        <Link
                          href={`/post/listing/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 rounded-xl border border-zinc-700/40 py-2.5 text-xs font-bold text-white/80 text-center transition-all duration-200 hover:border-zinc-600 hover:text-white active:scale-[0.97]"
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
                        className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-xs font-bold text-white text-center shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]"
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
                        className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]"
                      >
                        {item.paymentType === "contact" ? ARRANGE_PURCHASE_CARD_LABEL : "Buy Now"}
                      </button>
                      {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                        <Link
                          href={`/post/listing/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 rounded-xl border border-zinc-700/40 py-2.5 text-xs font-bold text-white/80 text-center transition-all duration-200 hover:border-zinc-600 hover:text-white active:scale-[0.97]"
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
                          className="text-[11px] text-white/60 underline underline-offset-2 transition-colors hover:text-white/90"
                        >
                          Offer
                        </button>
                      )}
                    </>
                  )}
                  <Link
                    href={`/post/listing/${item.id}#contact`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 rounded-xl border border-zinc-700/40 py-2.5 text-xs font-bold text-white/80 text-center transition-all duration-200 hover:border-zinc-600 hover:text-white active:scale-[0.97]"
                  >
                    Message
                  </Link>
                </>
              )}
              {isOwner && onPromote && onDelete && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(item);
                    }}
                    className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]"
                  >
                    📈 Boost
                  </button>
                  <Link
                    href={`/post/ai?edit=${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 rounded-xl border border-zinc-700/40 py-2.5 text-xs font-bold text-white/80 text-center transition-all duration-200 hover:border-zinc-600 hover:text-white active:scale-[0.97]"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item);
                    }}
                    className="rounded-xl bg-zinc-800/60 px-4 py-2.5 text-xs font-bold text-white/60 transition-all duration-200 hover:bg-zinc-700/60 hover:text-white/90 active:scale-[0.97]"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>

            {/* Seller section */}
            {(() => {
              const email = item.sellerEmail;
              const liveUsername = email ? sellerHandles[email] : "";
              const sellerLink = sellerProfileSlug({
                sellerUsername: liveUsername || item.sellerUsername,
                sellerEmail: email,
              });
              const displayName = sellerProfileDisplayName(
                {
                  sellerUsername: liveUsername || item.sellerUsername,
                  sellerEmail: email,
                },
                email?.split("@")[0] || "Seller"
              );
              const initial = displayName.charAt(0).toUpperCase();
              const stats = sellerReviewStats[email || ""];
              const avgRating = stats ? stats.avg : 0;
              const reviewCount = stats ? stats.count : 0;

              return (
                <Link
                  href={isOwner ? "#" : `/seller/${encodeURIComponent(sellerLink)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block"
                >
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 transition-all duration-200 hover:bg-white/[0.04]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-sky-600/10 text-sm font-bold text-sky-400 ring-1 ring-white/[0.06]">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-white/90">
                          {displayName}
                        </span>
                        {sellerFullyVerified?.[email || ""] && (
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-400">
                            ✓ Verified
                          </span>
                        )}
                        {sellerBadges[email || ""] === "legendary" && (
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-400 animate-pulse">
                            👑 The Five
                          </span>
                        )}
                        {sellerBadges[email || ""] === "epic" && (
                          <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold text-sky-400">
                            💎 Epic
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTrustLegend(!showTrustLegend);
                          }}
                          className="text-white/30 hover:text-sky-400 transition-colors"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>
                      {showTrustLegend && (
                        <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2">
                          <p className="text-[10px] font-semibold text-sky-400">Trust Signals</p>
                          <div className="mt-1.5 space-y-1 text-[9px] text-zinc-400">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400">✓</span>
                              <span>ID verified seller</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400">👑</span>
                              <span>Top 5 sellers (The Five)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-400">💎</span>
                              <span>High-rated seller (Epic)</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[11px] text-white/70">
                        <SellerReviewSummary
                          avg={avgRating}
                          count={reviewCount}
                          starSize="xs"
                          ratingClassName="text-white/70"
                          countClassName="text-white/70"
                          emptyLabel="No reviews yet"
                        />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <svg className="h-4 w-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })()}
            </div>
          </div>
        </div>
      </div>
  );
}
