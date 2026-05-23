"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Navbar from "../components/Navbar";
import Background from "../components/Background";

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
  [key: string]: unknown;
}

export default function WatchlistPage() {
  const [user, setUser] = useState<User | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.uid) {
        const q = query(collection(db, "users", currentUser.uid, "watchlist"), orderBy("savedAt", "desc"));
        const unsubWatch = onSnapshot(q, (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WatchlistItem));
          setWatchlist(items);
          localStorage.setItem("watchlist", JSON.stringify(items));
          setLoading(false);
        }, () => setLoading(false));
        return () => unsubWatch();
      } else {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const removeItem = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const updated = watchlist.filter((item) => item.id !== id);
    setWatchlist(updated);
    localStorage.setItem("watchlist", JSON.stringify(updated));

    if (user?.uid) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "watchlist", id));
      } catch (err) {
        console.error("Failed to remove from Firestore:", err);
      }
    }
  };

  const clearAll = async () => {
    for (const item of watchlist) {
      if (user?.uid) {
        try { await deleteDoc(doc(db, "users", user.uid, "watchlist", item.id)); } catch {}
      }
    }
    setWatchlist([]);
    localStorage.setItem("watchlist", "[]");
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
          parseFloat(a.price?.replace(/[^0-9]/g, "") || "0") -
          parseFloat(b.price?.replace(/[^0-9]/g, "") || "0")
      );
    } else if (sortBy === "price-high") {
      items.sort(
        (a, b) =>
          parseFloat(b.price?.replace(/[^0-9]/g, "") || "0") -
          parseFloat(a.price?.replace(/[^0-9]/g, "") || "0")
      );
    }

    return items;
  }, [watchlist, search, sortBy]);

  if (loading) {
    return (
      <main className="relative min-h-screen bg-[var(--background)]">
        <Background />
        <Navbar />
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4,5,6,7,8].map((i) => (
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
            className="mt-6 rounded-xl bg-sky-500 px-8 py-3 font-bold text-[var(--foreground)] hover:bg-sky-400"
          >
            Log In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
        <h1 className="text-2xl font-black text-[var(--foreground)] mb-6">Watchlist</h1>
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="text-6xl mb-4">👀</div>
            <p className="text-xl text-[var(--muted)]">No items in watchlist</p>
            <Link
              href="/"
              className="mt-6 rounded-xl bg-sky-500 px-8 py-3 font-bold text-[var(--foreground)] hover:bg-sky-400"
            >
              Browse Listings
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search watchlist..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-sky-500 w-64"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-sky-500"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="price-low">Price: Low → High</option>
                <option value="price-high">Price: High → Low</option>
              </select>
            </div>

            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-[var(--muted)]">
                {filteredWatchlist.length} item{filteredWatchlist.length !== 1 ? "s" : ""}
              </p>
              {filteredWatchlist.length > 0 && (
                <button onClick={() => setClearConfirm(true)} className="rounded-lg border border-red-500/20 px-3 py-1.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10">Clear all</button>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {filteredWatchlist.map((item) => {
                const imgSrc = (item as any).images?.[0] || item.imageUrl || item.image || "";
                const isExpired = item.expiresAt?.toMillis?.() < Date.now();
                return (
                <Link
                  key={item.id}
                  href={`/post/listing/${item.id}`}
                  className="group relative block overflow-hidden rounded-xl bg-zinc-900/60 border border-zinc-800/50 transition-all duration-200 hover:-translate-y-1 hover:border-sky-500/30 hover:shadow-[0_8px_25px_rgba(0,0,0,0.2)]"
                >
                  <button
                    onClick={(e) => removeItem(item.id, e)}
                    className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-red-500/80 text-[var(--foreground)] transition hover:bg-red-500 md:opacity-0 md:group-hover:opacity-100 opacity-100"
                    title="Remove"
                  >
                    ✕
                  </button>
                  <div className="relative aspect-square bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-purple-600/10 overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={item.title}
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--foreground)] text-xs">
                        <div className="text-center">
                          <div className="text-2xl font-bold mb-1">SD</div>
                          <div className="text-xs">Sky Drop</div>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    {item.status === "sold" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <span className="rounded-md bg-red-600/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">Sold</span>
                      </div>
                    )}
                    {item.status !== "sold" && isExpired && (
                      <div className="absolute top-2 right-2">
                        <span className="rounded-md bg-zinc-700/90 px-2 py-0.5 text-[9px] font-bold text-[var(--muted)] uppercase">Expired</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-medium text-sky-400">
                      {item.category || "General"}
                    </p>
                    <h3 className="mt-1 truncate font-semibold text-[var(--foreground)] group-hover:text-sky-300">
                      {item.title}
                    </h3>
                    <p className="mt-2 font-bold text-sky-400">${item.price}</p>
                  </div>
                </Link>
              );
            })}
            </div>

            <div className="mt-8 flex justify-center">
              <Link href="/" className="rounded-lg border border-zinc-700 px-5 py-2 text-[12px] font-bold text-[var(--foreground)] transition hover:border-sky-500/40 hover:text-sky-400">Explore more listings</Link>
            </div>
          </>
        )}
      </div>

      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setClearConfirm(false)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Clear all watchlist items?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This will remove all {watchlist.length} items. This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={clearAll} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
