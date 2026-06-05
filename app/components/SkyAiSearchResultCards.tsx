"use client";

import Link from "next/link";
import { useState } from "react";
import { cdnUrl } from "../lib/cdn";
import { isInWatchlist } from "../lib/listing-card-utils";
import { showToast } from "./Toast";
import type { SkyAiSearchResultCard } from "../lib/sky-ai-listing-search";

type Props = {
  results: SkyAiSearchResultCard[];
};

function saveToWatchlist(card: SkyAiSearchResultCard) {
  try {
    const existing = JSON.parse(localStorage.getItem("watchlist") || "[]");
    if (existing.some((w: { id: string }) => w.id === card.id)) {
      showToast("Already in watchlist", "info");
      return;
    }
    existing.unshift({
      id: card.id,
      title: card.title,
      price: card.price,
      imageUrl: card.imageUrl || "",
      savedPrice: card.price,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem("watchlist", JSON.stringify(existing));
    showToast("Saved to watchlist!");
  } catch {
    showToast("Could not save to watchlist", "error");
  }
}

export default function SkyAiSearchResultCards({ results }: Props) {
  const [, tick] = useState(0);

  if (!results.length) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {results.map((card) => {
        const saved = isInWatchlist(card.id);
        return (
          <div
            key={card.id}
            className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/30"
          >
            <div className="flex gap-2.5 p-2.5">
              {card.imageUrl ? (
                <img
                  src={cdnUrl(card.imageUrl)}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-800/80 text-lg text-zinc-500">
                  📦
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[12px] font-bold text-white">{card.title}</p>
                {card.price && (
                  <p className="mt-0.5 text-sm font-black text-violet-300">${card.price}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                  {card.location && <span>📍 {card.location}</span>}
                  {card.condition && <span>{card.condition}</span>}
                </div>
                {card.description && (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                    {card.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex border-t border-white/[0.06]">
              <Link
                href={`/post/listing/${card.id}`}
                className="flex-1 py-2 text-center text-[10px] font-semibold text-sky-400 transition hover:bg-sky-500/10"
              >
                View Listing
              </Link>
              <button
                type="button"
                onClick={() => {
                  saveToWatchlist(card);
                  tick((t) => t + 1);
                }}
                className="flex-1 border-x border-white/[0.06] py-2 text-center text-[10px] font-semibold text-zinc-400 transition hover:bg-white/[0.04] hover:text-violet-300"
              >
                {saved ? "Saved ✓" : "Save"}
              </button>
              <Link
                href={`/post/listing/${card.id}#contact`}
                className="flex-1 py-2 text-center text-[10px] font-semibold text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
              >
                Message Seller
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
