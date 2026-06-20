"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import BrowseAwhinaAssistantPanel from "../components/BrowseAwhinaAssistantPanel";
import { useAwhinaInsightEffect } from "../contexts/AwhinaPageInsightContext";
import { buildWatchlistInsight } from "../lib/awhina-insights";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";

interface WatchlistItem {
  id: string;
  title: string;
  price: string;
  image?: string;
  imageUrl?: string;
  images?: string[];
  category?: string;
  status?: string;
  expiresAt?: any;
  savedPrice?: string;
  savedAt?: string;
  [key: string]: unknown;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price-low", label: "Price ↑" },
  { value: "price-high", label: "Price ↓" },
] as const;

export default function WatchlistPage() {
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingStats, setListingStats] = useState<Record<string, { views: number; bidCount: number }>>({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser?.uid) {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, "users", user.uid, "watchlist"), orderBy("savedAt", "desc"));
    const unsubWatch = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WatchlistItem));
      setWatchlist(items);
      try { localStorage.setItem("watchlist", JSON.stringify(items)); } catch (e) { console.error("Failed to save watchlist:", e); }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubWatch();
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, { views: number; bidCount: number }> = {};
      for (const item of watchlist) {
        if (!item.id) continue;
        try {
          const snap = await getDoc(doc(db, "listings", item.id));
          if (snap.exists() && !cancelled) {
            const data = snap.data();
            map[item.id] = { views: data.views || 0, bidCount: data.bidCount || 0 };
          }
        } catch {}
      }
      if (!cancelled) setListingStats(map);
    })();
    return () => { cancelled = true; };
  }, [watchlist]);

  const popularIds = useMemo(() => {
    const entries = Object.entries(listingStats);
    if (entries.length === 0) return new Set<string>();
    const maxViews = Math.max(...entries.map(([, s]) => s.views), 1);
    const maxBids = Math.max(...entries.map(([, s]) => s.bidCount), 1);
    return new Set(
      entries
        .filter(([, s]) => s.views / maxViews + s.bidCount / maxBids >= 0.6)
        .map(([id]) => id)
    );
  }, [listingStats]);

  const removeItem = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const updated = watchlist.filter((item) => item.id !== id);
    setWatchlist(updated);
    try { localStorage.setItem("watchlist", JSON.stringify(updated)); } catch (e) { console.error("Failed to save watchlist:", e); }

    if (user?.uid) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "watchlist", id));
        await deleteDoc(doc(db, "watchlist", `${user.uid}_${id}`));
      } catch (err) {
        console.error("Failed to remove from Firestore:", err);
      }
    }
  };

  const clearAll = async () => {
    for (const item of watchlist) {
      if (user?.uid) {
        try { await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id)); } catch {}
        try { await deleteDoc(doc(db, "watchlist", `${user.uid}_${item.id}`)); } catch {}
      }
    }
    setWatchlist([]);
    try { localStorage.setItem("watchlist", "[]"); } catch (e) { console.error("Failed to clear watchlist:", e); }
    setClearConfirm(false);
  };

  const filteredWatchlist = useMemo(() => {
    let items = [...watchlist];

    if (sortBy === "oldest") items.reverse();

    if (search) {
      items = items.filter(
        (item) =>
          item.title?.toLowerCase().includes(search.toLowerCase()) ||
          item.category?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (sortBy === "price-low") {
      items.sort(
        (a, b) =>
          parseFloat(String(a.price || "0").replace(/[$,]/g, "")) -
          parseFloat(String(b.price || "0").replace(/[$,]/g, ""))
      );
    } else if (sortBy === "price-high") {
      items.sort(
        (a, b) =>
          parseFloat(String(b.price || "0").replace(/[$,]/g, "")) -
          parseFloat(String(a.price || "0").replace(/[$,]/g, ""))
      );
    }

    return items;
  }, [watchlist, search, sortBy]);

  const awhinaInsight = useMemo(
    () => buildWatchlistInsight(watchlist, popularIds),
    [watchlist, popularIds]
  );
  useAwhinaInsightEffect(awhinaInsight);

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)]">
        <Background />
        <Navbar />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {[1,2,3,4,5,6,7,8,9,10].map((i) => (
              <div key={i} className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 overflow-hidden animate-pulse">
                <div className="aspect-square bg-zinc-800/50" />
                <div className="p-4 space-y-2">
                  <div className="h-3 w-16 rounded bg-zinc-800/50" />
                  <div className="h-4 w-32 rounded bg-zinc-800/50" />
                  <div className="h-5 w-12 rounded bg-zinc-800/50" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative min-h-screen bg-[var(--background)]">
        <Background />
        <Navbar />
        <div className="relative z-10 flex flex-col items-center justify-center py-40">
          <div className="text-6xl mb-4">🔐</div>
          <p className="text-xl text-[var(--muted)]">Log in to view your watchlist</p>
          <Link
            href="/login"
            className="mt-6 rounded-xl bg-sky-500 px-8 py-3 font-bold text-white hover:bg-sky-400 transition-all active:scale-[0.97]"
          >
            Log In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)]">
      <Background />
      <Navbar />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 mb-5 sm:mb-6 group">
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>

        <div className="relative mb-8 sm:mb-10 text-center">
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/10 via-sky-300/5 to-purple-500/10 blur-3xl pointer-events-none" />
          <div className="relative inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] font-bold text-sky-300 mb-4 tracking-wide uppercase">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
            Saved Items
          </div>
          <h1 className="relative text-3xl sm:text-4xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">Watchlist</span>
          </h1>
          <BrowseAwhinaAssistantPanel className="mt-4 mb-0 mx-auto w-full max-w-2xl text-left" />
          <p className="relative mt-3 text-sm text-zinc-500">{watchlist.length} saved item{watchlist.length !== 1 ? "s" : ""}</p>
        </div>

        {watchlist.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">Nothing saved yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Tap the ♡ icon on any listing to save it here.</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.97]">
              Browse Listings
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <div className="relative flex-1 max-w-xs">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search watchlist..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10"
                />
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      sortBy === opt.value
                        ? "bg-sky-500/15 text-sky-300 border border-sky-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {filteredWatchlist.length > 0 && (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500/15 active:scale-[0.97] shrink-0"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredWatchlist.map((item) => {
                const imgSrc = (item as any).images?.[0] || item.imageUrl || item.image || "";
                const isExpired = item.expiresAt?.toMillis?.() < currentTime;
                const isHot = popularIds.has(item.id);
                const priceDrop = item.savedPrice && item.price && Number(item.savedPrice) > Number(item.price);
                return (
                  <Link key={item.id} href={`/post/listing/${item.id}`}
                    className={`group relative block overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 ${
                      isHot
                        ? "border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.04] to-transparent shadow-[0_0_25px_rgba(14,165,233,0.08)] hover:border-sky-500/40 hover:shadow-[0_0_35px_rgba(14,165,233,0.15)]"
                        : "border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)]"
                    }`}>
                    <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-sky-500/5 via-sky-500/5 to-sky-600/5">
                      {imgSrc ? (
                        <img src={imgSrc} alt={item.title} loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <div className="text-center">
                            <div className="text-3xl font-black tracking-tighter text-zinc-600">SD</div>
                            <div className="text-[10px] uppercase tracking-widest text-zinc-700">Sky Drop</div>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                      <button onClick={(e) => removeItem(item.id, e)}
                        className="absolute top-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white/70 transition hover:bg-red-500/80 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                        title="Remove">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>

                      <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
                        {isHot && (
                          <span className="rounded-full bg-gradient-to-r from-sky-500 to-sky-400 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-sky-500/30">
                            🔥 Hot
                          </span>
                        )}
                        {!isListingVisibleInMarketplace(item) && (
                          <span className="rounded-full bg-red-500/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg">
                            Sold
                          </span>
                        )}
                        {isListingVisibleInMarketplace(item) && isExpired && (
                          <span className="rounded-full bg-zinc-700/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-zinc-300 shadow-lg">
                            Expired
                          </span>
                        )}
                        {isListingVisibleInMarketplace(item) && priceDrop && (
                          <span className="rounded-full bg-sky-500/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg animate-pulse">
                            📉 -${Math.round(Number(item.savedPrice) - Number(item.price))}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-block rounded-md bg-sky-500/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-sky-400 border border-sky-500/10">
                          {item.category || "General"}
                        </span>
                        {item.savedPrice && (
                          <span className="text-[9px] text-zinc-500">Saved at ${item.savedPrice}</span>
                        )}
                      </div>
                      <h3 className="mt-2 line-clamp-1 text-sm font-bold text-white group-hover:text-sky-400 transition-colors duration-150">{item.title}</h3>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-lg font-black text-sky-400">${item.price}</span>
                        {priceDrop && (
                          <span className="text-xs text-zinc-500 line-through">${item.savedPrice}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-10 flex justify-center">
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 text-sm font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]">
                Explore more listings
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </>
        )}
      </div>

      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setClearConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700/50 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-black text-white">Clear your watchlist?</h3>
            <p className="mt-2 text-center text-sm text-zinc-400">This will remove all {watchlist.length} saved items.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 rounded-xl border border-zinc-700/50 bg-zinc-800 py-3 text-sm font-bold text-zinc-300 hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={clearAll} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400 active:scale-[0.97] transition-all">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
