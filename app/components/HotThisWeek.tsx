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
  [key: string]: unknown;
}

interface HotThisWeekProps {
  items: HotItem[];
  /** @deprecated Cards always use the homepage sky palette */
  accent?: "sky" | "sky" | "sky" | "sky";
  timeAgo: (seconds: number) => string;
  saveRecentlyViewed: (item: HotItem) => void;
  cdnUrl: (url: string) => string;
  listingWatchlistCount?: (item: HotItem) => number;
  listingWatchlistGlowIntensity?: (count: number) => number;
  user?: User | null;
  sellerReviewStats?: Record<string, { avg: number; count: number }>;
  sellerBadges?: Record<string, string>;
  sellerFullyVerified?: Record<string, boolean>;
}

const NEON_CARD =
  "border-sky-400/55 bg-white/[0.02] hover:border-sky-300/80 hover:bg-sky-500/[0.06] hover:shadow-[0_0_24px_rgba(56,189,248,0.2),0_0_48px_rgba(14,165,233,0.1)]";
const CREAM_BADGE =
  "rounded-full bg-[rgba(255,248,231,0.18)] px-2 py-0.5 text-[8px] font-bold text-[var(--cream)] backdrop-blur-sm";

export default function HotThisWeek({
  items,
  timeAgo,
  saveRecentlyViewed,
  cdnUrl,
  listingWatchlistCount: watchlistCountFn = listingWatchlistCount,
  listingWatchlistGlowIntensity: watchlistGlowFn = listingWatchlistGlowIntensity,
  user: userProp,
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
          const imageSrc = item.images?.[0] || item.imageUrl || item.image;
          const sellerEmail = item.sellerEmail || "";
          const username = item.sellerUsername || sellerEmail.split("@")[0] || "Seller";
          const isOwnListing = Boolean(user?.email && user.email === sellerEmail);
          const profileHref = isOwnListing ? "/profile" : `/seller/${item.sellerUsername || sellerEmail}`;
          const messageHref = `/messages?user=${encodeURIComponent(sellerEmail)}&listing=${encodeURIComponent(item.id)}`;

          return (
            <HotWeekCard
              key={item.id}
              item={item}
              hotGlow={hotGlow}
              imageSrc={imageSrc}
              username={username}
              sellerEmail={sellerEmail}
              isOwnListing={isOwnListing}
              profileHref={profileHref}
              messageHref={messageHref}
              hotSaves={hotSaves}
              timeAgo={timeAgo}
              cdnUrl={cdnUrl}
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
  imageSrc,
  username,
  sellerEmail,
  isOwnListing,
  profileHref,
  messageHref,
  hotSaves,
  timeAgo,
  cdnUrl,
  saveRecentlyViewed,
  router,
}: {
  item: HotItem;
  hotGlow: number;
  imageSrc: string | undefined;
  username: string;
  sellerEmail: string;
  isOwnListing: boolean;
  profileHref: string;
  messageHref: string;
  hotSaves: number;
  timeAgo: (seconds: number) => string;
  cdnUrl: (url: string) => string;
  saveRecentlyViewed: (item: HotItem) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const openListing = useDragGuardClick(() => {
    saveRecentlyViewed(item);
    router.push(`/post/listing/${item.id}`);
  });

  return (
    <div
      className={`hot-week-card group relative w-56 shrink-0 cursor-pointer rounded-2xl border p-2 text-[var(--cream)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] sm:w-60 ${NEON_CARD}`}
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
                {imageSrc ? (
                  <img
                    src={cdnUrl(imageSrc)}
                    alt={item.title}
                    loading="lazy"
                    className="h-32 w-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-36"
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-sky-500/10 sm:h-36">
                    <span className="text-[10px] font-medium text-white/30">No image</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute top-2 left-2">
                  <span className={CREAM_BADGE}>🔥 Trending</span>
                </div>
                {hotSaves > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-[rgba(255,248,231,0.2)] bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-[var(--cream)] backdrop-blur-md">
                      ⭐ {hotSaves.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1 px-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 flex-1 text-[13px] font-bold leading-snug text-always-white">
                    {item.title}
                  </p>
                  <p className="shrink-0 text-sm font-black tabular-nums text-white">${item.price}</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  {item.location && <span className="truncate">📍 {item.location}</span>}
                  {item.createdAt?.seconds != null && (
                    <span className="shrink-0">{timeAgo(item.createdAt.seconds)}</span>
                  )}
                </div>
              </div>

              {sellerEmail && (
                <div
                  className="mt-2 flex items-center gap-1.5 border-t border-white/[0.06] pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={profileHref}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-white/[0.04]"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(255,248,231,0.12)] text-[9px] font-bold text-[var(--cream)]">
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-[10px] font-semibold text-[var(--cream)]">
                      {username}
                    </span>
                  </Link>
                  {!isOwnListing && (
                    <Link
                      href={messageHref}
                      className="shrink-0 rounded-md border border-zinc-700/40 px-2 py-1 text-[9px] font-semibold text-[var(--cream)] transition hover:border-sky-400/40 hover:bg-sky-500/10"
                    >
                      Message
                    </Link>
                  )}
                </div>
              )}
    </div>
  );
}
