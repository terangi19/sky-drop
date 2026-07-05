"use client";

import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { FLOATING_MATCHMAKING_POSITION } from "../lib/floating-ui-layout";

interface MatchmakingEvent {
  id: string;
  type: "match_found" | "match_sent" | "match_received";
  listingId: string;
  listingTitle: string;
  listingImage?: string;
  matchedWith?: string;
  matchedWithEmail?: string;
  timestamp: number;
  keyword?: string;
}

export default function MatchmakingActivity() {
  const [events, setEvents] = useState<MatchmakingEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadMatchmakingEvents(user.email || "");
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  async function loadMatchmakingEvents(userEmail: string) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/matchmaking-events", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setEvents(data.events || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      console.error("Failed to load matchmaking events:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading || events.length === 0) {
    return null;
  }

  return (
    <div className={FLOATING_MATCHMAKING_POSITION}>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center gap-2 rounded-full border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)] backdrop-blur-sm transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span>{unreadCount} New Matches</span>
        </button>
      )}

      {isOpen && (
        <div className="w-80 rounded-2xl border border-emerald-500/30 bg-black/95 shadow-2xl shadow-emerald-500/20 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-emerald-500/20 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-white">Auto-Matching Activity</h3>
              <p className="text-[10px] text-emerald-400">{events.length} recent matches</p>
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
            {events.map((event) => (
              <div
                key={event.id}
                className="flex gap-3 border-b border-white/[0.06] p-3"
              >
                {event.listingImage ? (
                  <img
                    src={event.listingImage}
                    alt={event.listingTitle}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
                    <span className="text-[10px] text-white/30">No image</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{event.listingTitle}</p>
                  <p className="text-[10px] text-emerald-400">
                    {event.type === "match_found" && "✓ Match found"}
                    {event.type === "match_sent" && "→ Match sent to seller"}
                    {event.type === "match_received" && "← You received a match"}
                  </p>
                  {event.keyword && (
                    <p className="text-[10px] text-zinc-400">Keyword: {event.keyword}</p>
                  )}
                  <p className="text-[9px] text-zinc-500">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-emerald-500/20 px-4 py-3">
            <p className="text-center text-[10px] text-zinc-400">
              Auto-matching runs when you create listings or wanted posts
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
