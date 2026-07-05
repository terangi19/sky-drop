"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { FLOATING_RADAR_POSITION } from "../lib/floating-ui-layout";

interface RadarMatch {
  id: string;
  title: string;
  price: string;
  imageUrl?: string;
  image?: string;
  matchReason: string;
  matchScore: number;
  createdAt?: { seconds: number };
  type?: string;
}

interface MarketplaceRadarProps {
  userId?: string;
}

export default function MarketplaceRadar({ userId }: MarketplaceRadarProps) {
  const router = useRouter();
  const [matches, setMatches] = useState<RadarMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadRadarMatches(user.email || "");
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  async function loadRadarMatches(userEmail: string) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/radar-matches", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (e) {
      console.error("Failed to load radar matches:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return null;
  }

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className={FLOATING_RADAR_POSITION}>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center gap-2 rounded-full border border-sky-500/30 bg-gradient-to-r from-sky-500/20 to-sky-500/10 px-4 py-3 text-sm font-bold text-sky-400 shadow-[0_0_20px_rgba(14,165,233,0.3)] backdrop-blur-sm transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(14,165,233,0.4)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
          </span>
          <span>{matches.length} New Matches</span>
        </button>
      )}

      {isOpen && (
        <div className="w-80 rounded-2xl border border-sky-500/30 bg-black/95 shadow-2xl shadow-sky-500/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-sky-500/20 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-white">Marketplace Radar</h3>
              <p className="text-[10px] text-sky-400">Found {matches.length} matches for you</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {matches.map((match) => (
              <div
                key={match.id}
                onClick={() => router.push(`/post/listing/${match.id}`)}
                className="flex cursor-pointer gap-3 border-b border-white/[0.06] p-3 transition hover:bg-white/[0.04]"
              >
                {match.imageUrl || match.image ? (
                  <img
                    src={match.imageUrl || match.image}
                    alt={match.title}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/10 to-sky-500/5">
                    <span className="text-[10px] text-white/30">No image</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{match.title}</p>
                  <p className="text-[10px] font-black tabular-nums text-sky-400">${match.price}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{match.matchReason}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <div className="h-1 flex-1 rounded-full bg-white/10">
                      <div
                        className="h-1 rounded-full bg-gradient-to-r from-sky-500 to-sky-400"
                        style={{ width: `${match.matchScore}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-sky-400">{match.matchScore}% match</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-sky-500/20 px-4 py-3">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/search");
              }}
              className="w-full rounded-xl border border-sky-500/30 bg-sky-500/10 py-2 text-xs font-bold text-sky-400 transition hover:bg-sky-500/20 hover:text-sky-300"
            >
              View All Matches
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
