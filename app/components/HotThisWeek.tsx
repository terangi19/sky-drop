"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";
import {
  listingWatchlistCount,
  listingWatchlistGlowIntensity,
} from "../lib/listing-watchlist-count";
import { PAGE_SHELL_MARKETPLACE } from "../lib/page-layout";
import DragScrollCarousel, { useDragGuardClick } from "./DragScrollCarousel";
import ListingImage, { listingHasImage } from "./ListingImage";
import {
  resolveSellerCardDisplayName,
  resolveSellerCardProfileSlug,
  sellerMessagesUrl,
} from "../lib/public-display";

interface HotItem {
  id: string;
  title: string;
  price: string;
  images?: string[];
  imageUrl?: string;
  image?: string;
  location?: string;
  createdAt?: { seconds: number };
  views?: number;
  sellerEmail?: string;
  sellerUsername?: string;
  sellerId?: string;
  [key: string]: unknown;
}

interface HotThisWeekProps {
  items: HotItem[];
  /** @deprecated Cards always use the homepage sky palette */
  accent?: "sky" | "sky" | "sky" | "sky";
  timeAgo: (seconds: number) => string;
  saveRecentlyViewed: (item: HotItem) => void;
  /** @deprecated Listing images use ListingImage directly */
  cdnUrl?: (url: string) => string;
  listingWatchlistCount?: (item: HotItem) => number;
  listingWatchlistGlowIntensity?: (count: number) => number;
  user?: User | null;
  sellerReviewStats?: Record<string, { avg: number; count: number }>;
  sellerBadges?: Record<string, string>;
  sellerHandles?: Record<string, string>;
  sellerFullyVerified?: Record<string, boolean>;
}

const IMG_BADGE = "lc-img-badge rounded-full px-2 py-0.5 text-[8px] font-bold";

export default function HotThisWeek({
  items,
  timeAgo,
  saveRecentlyViewed,
  listingWatchlistCount: watchlistCountFn = listingWatchlistCount,
  listingWatchlistGlowIntensity: watchlistGlowFn = listingWatchlistGlowIntensity,
  user: userProp,
  sellerHandles = {},
}: HotThisWeekProps) {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
    return () => unsub();
  }, []);

  const user = userProp ?? authUser;

  if (items.length === 0) return null;

  return (
    <section className={`${PAGE_SHELL_MARKETPLACE} pb-4`}>
      <div className="mb-3 flex items-center gap-2">
        <div className={`h-4 w-1 rounded-full bg-gradient-to-b ${t.hotBarGradient}`} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-400/90">
            Hot this week
          </p>
          <p className="text-xs font-semibold text-white">Trending right now</p>
        </div>
      </div>

      <DragScrollCarousel className="gap-3">
        {items.map((item) => {
          const hotSaves = watchlistCountFn(item);
          const hotGlow = watchlistGlowFn(hotSaves);
          const hasImage = listingHasImage(item);
          const sellerEmail = item.sellerEmail || "";
          const username = resolveSellerCardDisplayName(item, sellerHandles);
          const isOwnListing = Boolean(user?.email && user.email === sellerEmail);
          const profileSlug = resolveSellerCardProfileSlug(item, sellerHandles);
          const profileHref = isOwnListing
            ? "/profile"
            : profileSlug
              ? `/seller/${profileSlug}`
              : "#";
          const messageHref = sellerMessagesUrl(item, item.id);

          return (
            <HotWeekCard
              key={item.id}
              item={item}
              hotGlow={hotGlow}
              hasImage={hasImage}
              username={username}
              sellerEmail={sellerEmail}
              isOwnListing={isOwnListing}
              profileHref={profileHref}
              messageHref={messageHref}
              hotSaves={hotSaves}
              timeAgo={timeAgo}
              saveRecentlyViewed={saveRecentlyViewed}
              router={router}
            />
          );
        })}
      </DragScrollCarousel>
    </section>
  );
}

function HotWeekCard({
  item,
  hotGlow,
  hasImage,
  username,
  sellerEmail,
  isOwnListing,
  profileHref,
  messageHref,
  hotSaves,
  timeAgo,
  saveRecentlyViewed,
  router,
}: {
  item: HotItem;
  hotGlow: number;
  hasImage: boolean;
  username: string;
  sellerEmail: string;
  isOwnListing: boolean;
  profileHref: string;
  messageHref: string;
  hotSaves: number;
  timeAgo: (seconds: number) => string;
  saveRecentlyViewed: (item: HotItem) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const openListing = useDragGuardClick(() => {
    saveRecentlyViewed(item);
    router.push(`/post/listing/${item.id}`);
  });

  return (
    <div
      className="hot-week-card listing-card--neon group relative w-56 shrink-0 cursor-pointer rounded-2xl border p-2 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] sm:w-60"
              style={
                hotGlow > 0
                  ? {
                      borderColor: `rgba(56, 189, 248, ${0.45 + hotGlow * 0.3})`,
                    }
                  : undefined
              }
      onClick={openListing}
    >
      <div className="relative overflow-hidden rounded-xl">
                {hasImage ? (
                  <ListingImage
                    listing={item}
                    alt={item.title}
                    context={`HotThisWeek:${item.id}`}
                    className="h-32 w-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-36 aspect-[4/3]"
                  />
                ) : (
                  <div className="lc-placeholder relative flex aspect-[4/3] w-full items-center justify-center rounded-xl">
                    <div className="text-center">
                      <div className="lc-title text-2xl font-black tracking-tighter mb-0.5">SD</div>
                      <div className="lc-meta text-[9px] uppercase tracking-widest">Sky Drop</div>
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute top-2 left-2">
                  <span className={IMG_BADGE}>Trending</span>
                </div>
                {hotSaves > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="lc-saves-badge lc-on-image inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold">
                      {hotSaves.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1 px-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="lc-title line-clamp-1 flex-1 text-[13px] font-bold leading-snug">
                    {item.title}
                  </p>
                  <p className="lc-price shrink-0 text-sm font-black tabular-nums">${item.price}</p>
                </div>
                <div className="lc-meta flex items-center gap-2 text-[10px]">
                  {item.location && <span className="truncate">{item.location}</span>}
                  {item.createdAt?.seconds != null && (
                    <span className="shrink-0">{timeAgo(item.createdAt.seconds)}</span>
                  )}
                </div>
              </div>

              {sellerEmail && (
                <div
                  className="lc-seller mt-2 flex items-center gap-1.5 rounded-lg border-t pt-2"
                  style={{ borderTopColor: "var(--lc-divider)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={profileHref}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-[var(--lc-seller-hover-bg)]"
                  >
                    <div className="lc-avatar flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold">
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <span className="lc-seller-name truncate text-[10px] font-semibold">
                      {username}
                    </span>
                  </Link>
                  {!isOwnListing && (
                    <Link
                      href={messageHref}
                      className="lc-btn shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold"
                    >
                      Message
                    </Link>
                  )}
                </div>
              )}
    </div>
  );
}
