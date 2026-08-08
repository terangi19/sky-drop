"use client";

import type { CSSProperties } from "react";
import { useState, memo } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { isListingVisibleInMarketplace } from "../../lib/listing-availability";
import { timeAgo } from "../../lib/listing-card-utils";
import {
  listingWatchlistCount,
} from "../../lib/listing-watchlist-count";
import { SellerReviewSummary } from "../SellerReviewStars";
import ListingImage, { listingHasImage } from "../ListingImage";
import { purchaseButtonTitle, shortPurchaseLabel } from "../../lib/purchase-button-labels";
import {
  lookupSellerMetaValue,
  resolveSellerCardDisplayName,
  resolveSellerCardProfileSlug,
} from "../../lib/public-display";
import { getListingOwnerId } from "../../lib/listing-owner";
import { isStripeCheckoutVisibleClient } from "../../lib/stripe-checkout-flags";
import {
  formatListingPriceDisplay,
  formatListingPriceMeta,
  listingPrimaryCtaLabel,
} from "../../lib/listing-price-display";
import {
  isMessagingOnlyListingType,
  listingSupportsCondition,
} from "../../lib/listing-type-config";

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
  /** Live profile usernames keyed by owner UID / seller email */
  sellerHandles?: Record<string, string>;
  /** Live display names keyed by owner UID / seller email — preferred over handles */
  sellerDisplayNames?: Record<string, string>;
  sellerAvatars?: Record<string, string>;
  sellerFullyVerified?: Record<string, boolean>;
  sellerJoinedDate?: Record<string, string>;
  sellerListingCount?: Record<string, number>;
  /** When false, avoid flashing the "Seller" fallback before enrichment */
  sellerMetaReady?: boolean;
  onPromote?: (item: Record<string, any>) => void;
  onDelete?: (item: Record<string, any>) => void;
  accent?: "sky";
  /** Soft border accent — prefer off; elevation comes from tokens */
  neonGlow?: boolean;
  loading?: boolean;
};

const IMG_BADGE = "lc-img-badge rounded-full px-2.5 py-0.5 text-[9px] font-bold";

function listingCardAccentStyle(neonGlow?: boolean): CSSProperties | undefined {
  if (!neonGlow) return undefined;
  return {
    borderColor: "rgba(56, 189, 248, 0.36)",
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
  onMakeOffer: _onMakeOffer,
  sellerReviewStats,
  sellerBadges,
  sellerHandles = {},
  sellerDisplayNames = {},
  sellerAvatars = {},
  sellerFullyVerified = {},
  sellerJoinedDate = {},
  sellerListingCount = {},
  sellerMetaReady = true,
  onPromote,
  onDelete,
  accent = "sky",
  neonGlow = false,
  loading = false,
}: MarketplaceListingCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const themed = accent === "sky";
  const isVisible = isListingVisibleInMarketplace(item);
  const saves = themed ? listingWatchlistCount(item) : 0;
  const hasImage = listingHasImage(item);

  const cardAccentStyle = listingCardAccentStyle(neonGlow);
  const categoryLabel =
    item.type === "vehicle"
      ? "Cars"
      : item.category || "Other";
  const priceLabel = formatListingPriceDisplay(item);
  const priceMeta = formatListingPriceMeta(item);
  const primaryCta = listingPrimaryCtaLabel(item);
  const isMessagingOnlyType = isMessagingOnlyListingType(item.type);
  const ariaPrice =
    item.pricingType === "quote" || item.servicePricingType === "request_quote"
      ? "Quote required"
      : priceLabel;

  return (
    <div className="relative h-full">
      <div
        role="button"
        tabIndex={0}
        aria-label={`View listing: ${item.title}. ${ariaPrice ? `Price: ${ariaPrice}.` : ""} ${categoryLabel}`}
        className={`listing-card group relative z-[1] flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border animate-fade-in-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${neonGlow ? "listing-card--neon" : ""}`}
        style={{
          animationDelay: `${Math.min(cardIndex, 10) * 40}ms`,
          ...cardAccentStyle,
        }}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCardClick();
          }
        }}
      >

      {hasImage ? (
        <>
          <div className="relative shrink-0 overflow-hidden aspect-[4/3]">
            <ListingImage
              listing={item}
              alt={item.title}
              fill
              context={`MarketplaceListingCard:${item.id}`}
              className="transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            {!isVisible && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <span className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white">
                  {item.pricingType === "quote" ? "Sold · Quote" : `Sold · $${item.price}`}
                </span>
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {item.isDemo && (
                <span className="rounded-full px-2.5 py-0.5 text-[9px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
                  Demo
                </span>
              )}
              {item.promotedUntil?.toMillis?.() > Date.now() && (
                <span className={IMG_BADGE}>Promoted</span>
              )}
              {isVisible &&
                item.createdAt?.seconds &&
                Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                  <span className={IMG_BADGE}>New</span>
                )}
              {isVisible &&
                isStripeCheckoutVisibleClient() &&
                item.saleType &&
                String(item.saleType).includes("auction") && (
                  <span className={IMG_BADGE}>Auction</span>
                )}
              {item.type === "digital" && isVisible && (
                <span className={IMG_BADGE}>Digital</span>
              )}
              {item.type === "vehicle" && isVisible && (
                <span className={IMG_BADGE}>Vehicle</span>
              )}
              {item.type === "service" && isVisible && (
                <span className={IMG_BADGE}>Service</span>
              )}
              {item.type === "rental" && isVisible && (
                <span className={IMG_BADGE}>Rental</span>
              )}
              {item.type === "wanted" && isVisible && (
                <span className={IMG_BADGE}>Wanted</span>
              )}
            </div>
            {themed && isVisible && saves > 0 && (
              <div className="lc-saves-badge absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-semibold">
                {saves.toLocaleString()} {saves === 1 ? "save" : "saves"}
              </div>
            )}
            {isVisible && item.images?.length > 1 && (
              <div className="absolute top-3 right-3">
                <span className="lc-img-overlay-badge lc-on-image rounded-full px-2 py-0.5 text-[9px] font-medium">
                  {item.images.length}
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
                    className={`h-1 rounded-full ${
                      i === 0 ? "w-4 bg-sky-400" : "w-1 bg-zinc-700"
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
            {item.isDemo && (
              <span className="rounded-full px-2.5 py-0.5 text-[9px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400">
                Demo
              </span>
            )}
            {isVisible &&
              item.createdAt?.seconds &&
              Date.now() / 1000 - item.createdAt.seconds < 86400 && (
                <span className={IMG_BADGE}>New</span>
              )}
            {isVisible &&
              item.promoted &&
              !(item.createdAt?.seconds &&
              Date.now() / 1000 - item.createdAt.seconds < 86400) && (
                <span className={IMG_BADGE}>Promoted</span>
              )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <span className={`lc-chip rounded-md px-2 py-0.5 text-[10px] font-semibold`}>
              {categoryLabel}
            </span>
            {listingSupportsCondition(item.type) && item.condition && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  item.condition === "New" ? "lc-chip" : "lc-chip-neutral"
                }`}
              >
                {item.condition}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(item);
            }}
            className={`lc-watchlist touch-target relative inline-flex items-center justify-center text-base ${
              isInWatchlist(item.id) ? "lc-watchlist--active" : ""
            }`}
            aria-label={isInWatchlist(item.id) ? "Remove from watchlist" : "Add to watchlist"}
          >
            {isInWatchlist(item.id) ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <h2 className="lc-title flex-1 line-clamp-1 text-[15px] font-semibold tracking-tight sm:text-[16px]">
            {item.title}
          </h2>
        </div>

        <p className="lc-desc mt-1.5 line-clamp-2 text-[12px] leading-relaxed">
          {item.type === "vehicle"
            ? [
                item.vehicleYear,
                item.vehicleMake && item.vehicleModel
                  ? `${item.vehicleMake} ${item.vehicleModel}`
                  : null,
                item.vehicleOdometer != null && item.vehicleOdometer !== ""
                  ? `${Number(item.vehicleOdometer).toLocaleString()} km`
                  : null,
                item.vehicleTransmission || item.transmission,
                item.vehicleFuelType || item.fuelType,
              ]
                .filter(Boolean)
                .join(" · ") || item.description
            : item.description ||
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

        <div className="mt-2.5 flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            {item.pricingType === "quote" ||
            item.servicePricingType === "request_quote" ? (
              <>
                <p className="lc-price text-xl font-bold tracking-tight sm:text-2xl">{priceLabel}</p>
                <span className="lc-quote-badge rounded-md px-2 py-0.5 text-[9px] font-semibold">
                  Quote Required
                </span>
              </>
            ) : (
              <p className="lc-price text-xl font-bold tracking-tight sm:text-2xl">{priceLabel}</p>
            )}
            {(item.saleType === "auction" || item.saleType === "auction_buy_now") && (
              <span className="lc-bid rounded-md px-2 py-0.5 text-sm font-bold">
                Bid: ${item.currentBid || item.startingBid || 0}
              </span>
            )}
          </div>
          {priceMeta && (
            <p className="lc-meta text-[11px] opacity-70">{priceMeta}</p>
          )}
        </div>

        <div className="lc-meta mt-2.5 flex min-h-5 items-center gap-3 text-[11px]">
          {item.location && (
            <span className="flex items-center gap-1">{item.location}</span>
          )}
          {item.createdAt?.seconds != null && <span>{timeAgo(item.createdAt.seconds)}</span>}
          {item.pickupAvailable && <span>Pickup</span>}
          {item.shippingAvailable && <span>Shipping</span>}
          {themed ? (
            <span className="lc-accent ml-auto flex items-center gap-1 font-medium">
              {saves.toLocaleString()} {saves === 1 ? "save" : "saves"}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              {(item.views as number) || 0}
            </span>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-2.5">
        <div className="flex min-h-10 gap-2">
          {user && user.email !== item.sellerEmail && (
            <>
              {item.pricingType === "quote" ||
              item.servicePricingType === "request_quote" ? (
                <Link
                  href={`/post/listing/${item.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="lc-btn-primary flex flex-1 items-center justify-center rounded-lg py-2.5 text-[12px] font-semibold active:scale-95"
                >
                  Request Quote
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuyNow(item);
                  }}
                  disabled={loading}
                  className={`lc-btn-primary flex-1 rounded-lg py-2.5 text-[12px] font-semibold active:scale-95 ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
                  title={
                    isMessagingOnlyType
                      ? `Message the ${item.type === "service" ? "provider" : "owner"} to arrange details in chat`
                      : purchaseButtonTitle(item.paymentType)
                  }
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                      Processing...
                    </span>
                  ) : isMessagingOnlyType ? (
                    primaryCta
                  ) : (
                    shortPurchaseLabel(item.paymentType)
                  )}
                </button>
              )}
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
                className="lc-btn rounded-lg px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Boost
              </button>
              <Link
                href={`/post/ai?edit=${item.id}`}
                onClick={(e) => e.stopPropagation()}
                className="lc-btn rounded-lg px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="lc-btn-ghost rounded-lg px-4 py-2.5 text-[12px] font-semibold active:scale-95"
              >
                Remove
              </button>
            </>
          )}
        </div>

        <Link
          href={(() => {
            const slug = resolveSellerCardProfileSlug(item, sellerHandles);
            if (user?.email === item.sellerEmail || !slug) return "#";
            return `/seller/${slug}`;
          })()}
          onClick={(e) => e.stopPropagation()}
          className="block hover:cursor-pointer"
        >
          {(() => {
            const email = item.sellerEmail;
            const ownerId = getListingOwnerId(item);
            const resolvedName = resolveSellerCardDisplayName(
              item,
              sellerHandles,
              "Seller",
              sellerDisplayNames
            );
            const showSkeleton =
              !sellerMetaReady &&
              resolvedName === "Seller" &&
              Boolean(ownerId || email);
            const username = showSkeleton ? "" : resolvedName;
            const initial = username ? username.charAt(0).toUpperCase() : "?";
            const avatarUrl =
              lookupSellerMetaValue(sellerAvatars, item) || "";
            const stats =
              lookupSellerMetaValue(sellerReviewStats, item) ||
              sellerReviewStats[email || ""];
            const avgRating = stats ? stats.avg : 0;
            const reviewCount = stats ? stats.count : null;
            const isVerified =
              lookupSellerMetaValue(sellerFullyVerified, item) ||
              sellerFullyVerified?.[email || ""];
            
            return (
              <div className="lc-seller group rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <div className="lc-avatar relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-bold ring-1">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : showSkeleton ? (
                      <span className="h-3 w-3 animate-pulse rounded-full bg-current opacity-30" />
                    ) : (
                      initial
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {showSkeleton ? (
                        <span className="lc-seller-name inline-block h-3.5 w-20 animate-pulse rounded bg-current opacity-20" />
                      ) : (
                        <span className="lc-seller-name truncate text-[13px] font-semibold">
                          {username}
                        </span>
                      )}
                      {isVerified && !showSkeleton && (
                        <span className="lc-chip rounded px-1 py-0.5 text-[8px] font-bold">
                          ✓
                        </span>
                      )}
                    </div>
                    <div className="lc-seller-meta flex items-center gap-x-2 gap-y-0.5 text-[10px] mt-0.5 opacity-70">
                      {reviewCount != null && reviewCount > 0 && <span className="whitespace-nowrap">{avgRating.toFixed(1)}★ ({reviewCount})</span>}
                      {reviewCount === 0 && <span className="whitespace-nowrap">New seller</span>}
                    </div>
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
        <div
          className="mx-4 max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-lg)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-listing-title"
        >
          <h3 id="delete-listing-title" className="text-xl font-semibold text-[var(--foreground)]">Delete Listing?</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">Are you sure you want to delete &ldquo;{item.title}&rdquo;? This action cannot be undone.</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(false);
                onDelete?.(item);
              }}
              className="btn btn-danger flex-1"
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
