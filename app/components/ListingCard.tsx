"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { User } from "firebase/auth";
import { cdnUrl } from "../lib/cdn";
import { ARRANGE_PURCHASE_CARD_LABEL } from "../lib/arrange-purchase-copy";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import { timeAgo } from "../lib/listing-card-utils";
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

const IMG_BADGE =
  "rounded-full px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg backdrop-blur-sm";

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
        aria-label={`View listing: ${item.title}. ${item.price ? `Price: $${item.price}.` : ""} ${categoryLabel} in ${item.condition || "unknown condition"}`}
        aria-describedby={`listing-card-${item.id}-details`}
        className="listing-card relative z-[1] flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border animate-fade-in-up hover:-translate-y-2 active:-translate-y-1 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2"
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
        {imageSrc ? (
          <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-zinc-900">
            <Image
              src={cdnUrl(imageSrc)}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover opacity-0 transition-all duration-700 ease-out group-hover:scale-110"
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.opacity = "1";
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {!isVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                <span className="rounded-xl bg-gradient-to-br from-red-500 to-red-600 px-5 py-2 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-red-500/30">
                  {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                </span>
              </div>
            )}

            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {isVisible && (item.views || 0) > 3 && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-orange-500 to-orange-600 shadow-orange-500/30`}>
                  🔥 Hot
                </span>
              )}
              {item.promotedUntil?.toMillis?.() > Date.now() && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-purple-500 to-purple-600 shadow-purple-500/30`}>
                  📈 Promoted
                </span>
              )}
              {isVisible && item.createdAt?.seconds && Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/30`}>
                  New
                </span>
              )}
              {isVisible && String(item.saleType || "").includes("auction") && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-amber-500 to-amber-600 shadow-amber-500/30`}>
                  ⏰ Auction
                </span>
              )}
              {item.type === "digital" && isVisible && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-cyan-500 to-cyan-600 shadow-cyan-500/30`}>
                  📥 Digital
                </span>
              )}
              {item.type === "vehicle" && isVisible && (
                <span className={`${IMG_BADGE} bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-500/30`}>
                  🚗 Vehicle
                </span>
              )}
              {isVisible && item.expiresAt?.toMillis?.() < Date.now() && (
                <span className="lc-img-overlay-badge lc-on-image rounded-full px-2.5 py-0.5 text-[9px] font-bold">
                  Expired
                </span>
              )}
            </div>

            {item.images?.length > 1 && (
              <div className="absolute bottom-3 right-3">
                <span className="lc-img-overlay-badge lc-on-image rounded-full px-2 py-0.5 text-[9px] font-medium">
                  📷 {item.images.length}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="lc-placeholder relative flex aspect-[4/3] shrink-0 items-center justify-center">
            <div className="text-center">
              <div className="lc-title mb-1 text-3xl font-black tracking-tighter">SD</div>
              <div className="lc-meta text-[10px] uppercase tracking-widest">Sky Drop</div>
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

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="flex min-h-7 items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="lc-chip inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                {categoryLabel}
              </span>
              {item.condition && (
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold ${
                    item.condition === "New" ? "lc-chip" : "lc-chip-neutral"
                  }`}
                >
                  {item.condition === "New" ? "🆕 New" : item.condition}
                </span>
              )}
              {item.type === "vehicle" && (item.vehicleYear || item.year) && (
                <span className="lc-chip-neutral inline-flex items-center rounded-md px-2 py-0.5 text-[9px] font-semibold">
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
              className={`lc-watchlist relative shrink-0 text-base transition-all duration-200 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                isInWatchlist(item.id) ? "lc-watchlist--active" : ""
              }`}
            >
              {isInWatchlist(item.id) ? "❤️" : "♡"}
            </button>
          </div>

          <h2 className="lc-title mt-2.5 line-clamp-1 text-base font-bold tracking-tight">
            {item.title}
          </h2>

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

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {item.type === "service" ? (
              <>
                <ServicePricingBadge listing={item} size="sm" />
                <p className="lc-price text-2xl font-black tracking-tight sm:text-3xl">
                  {formatServicePriceDisplay(item)}
                </p>
              </>
            ) : item.pricingType === "quote" ? (
              <>
                <p className="lc-title text-lg font-bold tracking-tight sm:text-xl">Contact for Quote</p>
                <span className="lc-quote-badge rounded-full px-2.5 py-1 text-[10px] font-bold">Quote Required</span>
              </>
            ) : (
              <p className="lc-price text-3xl font-black tracking-tight sm:text-4xl">${item.price}</p>
            )}
            {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
              <span className="lc-bid rounded-lg px-2 py-1 text-sm font-bold">
                Bid: ${item.currentBid || item.startingBid || 0}
              </span>
            )}
          </div>

          <div className="lc-meta mt-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {item.location && (
              <span className="inline-flex items-center gap-1">📍 {item.location}</span>
            )}
            {item.createdAt?.seconds != null && <span>{timeAgo(item.createdAt.seconds)}</span>}
            {item.pickupAvailable && <span>📍 Pickup</span>}
            {item.shippingAvailable && <span>📦 Shipping</span>}
            <span className="ml-auto inline-flex items-center gap-1">
              👁 {(item.views as number) || 0}
            </span>
          </div>

          <div className="mt-auto space-y-4 pt-4">
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
                        className="lc-btn-primary flex-1 rounded-xl py-2.5 text-xs font-bold active:scale-[0.97]"
                      >
                        Make Offer
                      </button>
                      {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                        <Link
                          href={`/post/listing/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="lc-btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold active:scale-[0.97]"
                        >
                          Bid Now
                        </Link>
                      )}
                    </>
                  ) : item.pricingType === "quote" ? (
                    <Link
                      href={`/post/listing/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="lc-btn-primary flex-1 rounded-xl py-2.5 text-center text-xs font-bold active:scale-[0.97]"
                    >
                      Request Quote
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuyNow(item);
                        }}
                        className="lc-btn-primary flex-1 rounded-xl py-2.5 text-xs font-bold active:scale-[0.97]"
                      >
                        {item.paymentType === "contact" ? ARRANGE_PURCHASE_CARD_LABEL : "Buy Now"}
                      </button>
                      {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
                        <Link
                          href={`/post/listing/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="lc-btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold active:scale-[0.97]"
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
                          className="lc-link text-[11px]"
                        >
                          Offer
                        </button>
                      )}
                    </>
                  )}
                  <Link
                    href={`/post/listing/${item.id}#contact`}
                    onClick={(e) => e.stopPropagation()}
                    className="lc-btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold active:scale-[0.97]"
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
                    className="lc-btn-primary flex-1 rounded-xl py-2.5 text-xs font-bold active:scale-[0.97]"
                  >
                    📈 Boost
                  </button>
                  <Link
                    href={`/post/ai?edit=${item.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="lc-btn-ghost flex-1 rounded-xl py-2.5 text-center text-xs font-bold active:scale-[0.97]"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(item);
                    }}
                    className="lc-btn-ghost rounded-xl px-4 py-2.5 text-xs font-bold active:scale-[0.97]"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>

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
                  <div className="lc-seller flex items-center gap-3 rounded-xl p-3">
                    <div className="lc-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="lc-seller-name truncate text-[13px] font-semibold">
                          {displayName}
                        </span>
                        {sellerFullyVerified?.[email || ""] && (
                          <span className="lc-chip rounded px-1.5 py-0.5 text-[8px] font-bold">
                            ✓ Verified
                          </span>
                        )}
                        {sellerBadges[email || ""] === "legendary" && (
                          <span className="lc-chip animate-pulse rounded px-1.5 py-0.5 text-[8px] font-bold">
                            👑 The Five
                          </span>
                        )}
                        {sellerBadges[email || ""] === "epic" && (
                          <span className="lc-chip rounded px-1.5 py-0.5 text-[8px] font-bold">
                            💎 Epic
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTrustLegend(!showTrustLegend);
                          }}
                          className="lc-meta transition-colors hover:text-sky-500"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </div>
                      {showTrustLegend && (
                        <div className="lc-seller mt-2 rounded-lg p-3">
                          <p className="lc-accent text-[10px] font-semibold">Trust Signals</p>
                          <div className="lc-meta mt-1.5 space-y-1 text-[9px]">
                            <div className="flex items-center gap-1.5">
                              <span className="lc-chip rounded px-1 py-0.5 text-[8px] font-bold">✓</span>
                              <span>ID verified seller</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="lc-chip rounded px-1 py-0.5 text-[8px] font-bold">👑</span>
                              <span>Top 5 sellers (The Five)</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="lc-chip rounded px-1 py-0.5 text-[8px] font-bold">💎</span>
                              <span>High-rated seller (Epic)</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="lc-seller-meta flex items-center gap-1 text-[11px]">
                        <SellerReviewSummary
                          avg={avgRating}
                          count={reviewCount}
                          starSize="xs"
                          ratingClassName="lc-seller-meta"
                          countClassName="lc-seller-meta"
                          emptyLabel="No reviews yet"
                        />
                      </div>
                    </div>
                    <div className="shrink-0">
                      <svg className="lc-seller-link h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
