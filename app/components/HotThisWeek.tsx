"use client";

import { useRouter } from "next/navigation";

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
  [key: string]: unknown;
}

interface HotThisWeekProps {
  items: HotItem[];
  accent?: "orange" | "emerald" | "sky" | "amber";
  timeAgo: (seconds: number) => string;
  saveRecentlyViewed: (item: HotItem) => void;
  cdnUrl: (url: string) => string;
  listingWatchlistCount?: (item: HotItem) => number;
  listingWatchlistGlowIntensity?: (count: number) => number;
}

const accentMap = {
  orange: {
    from: "from-orange-500",
    via: "via-amber-500",
    to: "to-red-500",
    badge: "bg-orange-500/90",
    badgeText: "text-orange-400",
    glow: "rgba(251,146,60",
    gradient: "from-orange-500/15 via-amber-500/10 to-red-500/10",
    border: "hover:border-orange-400/40",
    shadow: "hover:shadow-[0_0_40px_-8px_rgba(251,146,60,0.35),0_8px_32px_-12px_rgba(0,0,0,0.5)]",
  },
  emerald: {
    from: "from-emerald-500",
    via: "via-green-500",
    to: "to-teal-500",
    badge: "bg-emerald-500/90",
    badgeText: "text-emerald-400",
    glow: "rgba(16,185,129",
    gradient: "from-emerald-500/15 via-green-500/10 to-teal-500/10",
    border: "hover:border-emerald-400/40",
    shadow: "hover:shadow-[0_0_40px_-8px_rgba(16,185,129,0.35),0_8px_32px_-12px_rgba(0,0,0,0.5)]",
  },
  sky: {
    from: "from-sky-500",
    via: "via-blue-500",
    to: "to-cyan-500",
    badge: "bg-sky-500/90",
    badgeText: "text-sky-400",
    glow: "rgba(14,165,233",
    gradient: "from-sky-500/15 via-blue-500/10 to-cyan-500/10",
    border: "hover:border-sky-400/40",
    shadow: "hover:shadow-[0_0_40px_-8px_rgba(14,165,233,0.35),0_8px_32px_-12px_rgba(0,0,0,0.5)]",
  },
  amber: {
    from: "from-amber-500",
    via: "via-yellow-500",
    to: "to-orange-500",
    badge: "bg-amber-500/90",
    badgeText: "text-amber-400",
    glow: "rgba(251,191,36",
    gradient: "from-amber-500/15 via-yellow-500/10 to-orange-500/10",
    border: "hover:border-amber-400/40",
    shadow: "hover:shadow-[0_0_40px_-8px_rgba(251,191,36,0.35),0_8px_32px_-12px_rgba(0,0,0,0.5)]",
  },
};

export default function HotThisWeek({
  items,
  accent = "orange",
  timeAgo,
  saveRecentlyViewed,
  cdnUrl,
  listingWatchlistCount,
  listingWatchlistGlowIntensity,
}: HotThisWeekProps) {
  const router = useRouter();
  const a = accentMap[accent];

  if (items.length === 0) return null;

  return (
    <section className="relative z-10 mx-auto max-w-[1800px] px-4 pb-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white">
            Hot this week
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">Trending right now</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
        {items.map((item) => {
          const hotSaves = listingWatchlistCount ? listingWatchlistCount(item) : 0;
          const hotGlow = listingWatchlistGlowIntensity ? listingWatchlistGlowIntensity(hotSaves) : 0;

          return (
            <div
              key={item.id}
              onClick={() => { saveRecentlyViewed(item); router.push(`/post/listing/${item.id}`); }}
              className={`group relative shrink-0 w-72 cursor-pointer rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5 transition-all duration-300 hover:-translate-y-0.5 ${a.border} ${a.shadow} backdrop-blur-sm`}
              style={{
                borderColor: hotGlow > 0
                  ? `${a.glow}, ${0.12 + hotGlow * 0.5})`
                  : undefined,
                boxShadow: hotGlow > 0
                  ? `0 0 ${Math.round(8 + hotGlow * 44)}px ${a.glow}, ${0.08 + hotGlow * 0.42})`
                  : undefined,
              }}
            >
              {/* Image */}
              <div className="relative overflow-hidden rounded-xl">
                {item.images?.[0] || item.imageUrl || item.image ? (
                  <img
                    src={cdnUrl(item.images?.[0] || item.imageUrl || item.image || "")}
                    alt={item.title}
                    loading="lazy"
                    className="h-40 w-full rounded-xl object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className={`flex h-40 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient}`}>
                    <div className="flex flex-col items-center gap-1.5">
                      <svg className="h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      <span className="text-[10px] font-medium text-white/20">No image</span>
                    </div>
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />

                <div className="absolute top-2.5 left-2.5">
                  <span
                    className="inline-flex items-center rounded-full border border-white/10 bg-black/50 px-2.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-md"
                    style={hotGlow > 0 ? {
                      boxShadow: `0 0 ${Math.round(6 + hotGlow * 24)}px ${a.glow}, ${0.4 + hotGlow * 0.6})`,
                    } : {}}
                  >
                    Trending
                  </span>
                </div>

                {/* Save count badge */}
                {hotSaves > 0 && (
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1.5 text-[9px] font-bold text-white/90 border border-white/[0.08]">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                      {hotSaves.toLocaleString()}
                    </span>
                  </div>
                )}

              </div>

              <div className="mt-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-white">
                    {item.title}
                  </p>
                  <p className="shrink-0 text-base font-semibold tabular-nums text-sky-300">${item.price}</p>
                </div>

                {item.location && (
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <svg className="h-3.5 w-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    <span>{item.location}</span>
                  </div>
                )}
              </div>

              {/* Footer metadata */}
              <div className="mt-3 flex items-center gap-4 border-t border-white/[0.04] pt-3 text-[11px] text-zinc-500">
                {item.createdAt?.seconds != null && (
                  <span className="flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {timeAgo(item.createdAt.seconds)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {item.views || 0} views
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
