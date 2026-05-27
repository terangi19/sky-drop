"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import PromoteModal from "../components/PromoteModal";

interface Listing {
  id: string;
  title: string;
  price: string;
  _collection?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  image?: string;
  images?: string[];
  sellerEmail?: string;
  status?: string;
  views?: number;
  expiresAt?: any;
  createdAt?: any;
  promotedUntil?: any;
  [key: string]: unknown;
}

export default function ListListPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "sold">("active");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [promoteItem, setPromoteItem] = useState<Listing | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const q1 = query(collection(db, "listings"), where("sellerEmail", "==", user.email));
    const unsub1 = onSnapshot(q1, (snap) => {
      if (cancelled) return;
      const physical = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: "listings" } as Listing));
      setListings(prev => {
        const digital = prev.filter(p => p._collection === "tradePosts");
        const merged = mergeListings(physical, digital);
        setLoading(false);
        return merged;
      });
    });

    const q2 = query(collection(db, "tradePosts"), where("sellerEmail", "==", user.email));
    const unsub2 = onSnapshot(q2, (snap) => {
      if (cancelled) return;
      const digital = snap.docs.map(d => ({ id: d.id, ...d.data(), _collection: "tradePosts" } as Listing));
      setListings(prev => {
        const physical = prev.filter(p => p._collection === "listings");
        const merged = mergeListings(physical, digital);
        setLoading(false);
        return merged;
      });
    });

    return () => { cancelled = true; unsub1(); unsub2(); };
  }, [user]);

  function mergeListings(...arrays: Listing[][]): Listing[] {
    const map = new Map<string, Listing>();
    for (const arr of arrays) {
      for (const item of arr) {
        map.set(item.id, item);
      }
    }
    const items = [...map.values()];
    items.sort((a, b) => ((b.createdAt as any)?.toDate?.() || 0) - ((a.createdAt as any)?.toDate?.() || 0));
    const now = Date.now();
    items.sort((a, b) => {
      const aProm = a.promotedUntil?.toMillis?.() > now ? 1 : 0;
      const bProm = b.promotedUntil?.toMillis?.() > now ? 1 : 0;
      return bProm - aProm;
    });
    return items;
  }

  const deleteListing = async (id: string) => {
    const listing = listings.find(l => l.id === id);
    if (!listing || listing.sellerEmail !== user?.email) {
      alert("You can only delete your own listings");
      return;
    }
    const col = (listing as any)._collection === "tradePosts" ? "tradePosts" : "listings";
    try {
      await deleteDoc(doc(db, col, id));
    } catch (error) {
      console.error(error);
      alert("Failed to delete");
    }
  };

  const filteredListings = useMemo(() => {
    let items = listings;
    if (activeTab === "active") items = items.filter((i) => i.status !== "sold");
    if (activeTab === "sold") items = items.filter((i) => i.status === "sold");
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.title?.toLowerCase().includes(q));
    }
    return items;
  }, [listings, activeTab, search]);

  const activeCount = listings.filter(i => i.status !== "sold").length;
  const soldCount = listings.filter(i => i.status === "sold").length;

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black tracking-tight text-[var(--foreground)]">
            My Listings
          </h1>
          <Link href="/post/ai" className="rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 transition">
            + New Listing
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 border-b border-zinc-800 pb-4 sm:border-b-0 sm:pb-0">
            <span className="rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white">
              Active ({activeCount})
            </span>
          </div>
          <input
            type="text" placeholder="Search listings..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-sky-500 w-full sm:w-64"
          />
        </div>

        {loading && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} className="rounded-xl bg-zinc-900/60 border border-zinc-800/50 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-zinc-800/50" />
                <div className="p-5 space-y-2">
                  <div className="h-4 w-16 rounded bg-zinc-800/50" />
                  <div className="h-5 w-32 rounded bg-zinc-800/50" />
                  <div className="h-6 w-16 rounded bg-zinc-800/50" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredListings.length === 0 && (
          <div className="mt-20 text-center">
            <p className="text-lg text-zinc-500">You haven't created any listings yet.</p>
            <Link href="/post/ai" className="mt-4 inline-block rounded-full bg-sky-500 px-5 py-2.5 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 transition">
              + Create Your First Listing
            </Link>
          </div>
        )}

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredListings.map((item) => {
            const isOwner = user && item.sellerEmail === user.email;
            const imgSrc = item.images?.[0] || item.imageUrl || item.image || "";
            const isExpired = item.expiresAt?.toMillis?.() < Date.now();
            return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-xl bg-zinc-900/60 border border-zinc-800/50 transition-all duration-200 hover:-translate-y-1 hover:border-sky-500/30 hover:shadow-[0_8px_25px_rgba(0,0,0,0.2)] cursor-pointer ${item.status === "sold" ? "opacity-80" : ""}`}
                onClick={() => router.push(item.type === "service" ? "/services" : item.type === "event" ? "/events" : item.type === "vehicle" ? "/vehicles" : item.type === "job" ? "/jobs" : item.type === "property" ? "/property" : `/post/listing/${item.id}`)}
              >
                <div className="relative overflow-hidden bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-purple-600/10">
                  {imgSrc ? (
                    <img src={imgSrc} alt={item.title} loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center text-[var(--foreground)] text-xs">
                      <div className="text-center"><div className="text-2xl font-bold mb-1">SD</div><div className="text-xs">Sky Drop</div></div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {item.promotedUntil?.toMillis?.() > Date.now() && <span className="rounded-md bg-amber-600/90 px-2 py-0.5 text-[9px] font-bold text-white">📈 Promoted</span>}
                    {isExpired && <span className="rounded-md bg-zinc-700/90 px-2 py-0.5 text-[9px] font-bold text-[var(--muted)] uppercase">Expired</span>}
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-400">
                      {item.category || "Other"}
                    </span>
                  </div>

                  <h2 className="mt-4 line-clamp-1 text-[18px] font-black tracking-tight text-[var(--foreground)]">
                    {item.title}
                  </h2>

                  <p className="mt-2 text-[20px] font-black text-sky-400">
                    ${item.price}
                  </p>

                  <div className="mt-3 flex items-center gap-3 text-[12px] text-[var(--muted)]">
                    <span>👁 {item.views || 0} views</span>
                    {item.images?.length > 1 && <span>📸 {item.images.length}</span>}
                  </div>

                  {isOwner && (
                    <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
                      {(item as any)._collection !== "tradePosts" && (
                        <button onClick={(e) => { e.stopPropagation(); setPromoteItem(item); }}
                          className="flex-1 rounded-lg bg-amber-500/10 px-3 py-3 text-[12px] font-bold text-amber-400 transition hover:bg-amber-500/20 active:scale-[0.97]">
                          📈 Boost
                        </button>
                      )}
                      {(item as any)._collection !== "tradePosts" && (
                        <Link href={`/post/ai?edit=${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-3 text-[12px] font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] text-center">
                          Edit
                        </Link>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                        className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-[12px] font-bold text-red-400 hover:bg-red-500/20 active:scale-[0.97]">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Delete this listing?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This cannot be undone.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={async () => { await deleteListing(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400">Delete</button>
            </div>
          </div>
        </div>
      )}

      {promoteItem && (
        <PromoteModal
          listing={promoteItem}
          onClose={() => setPromoteItem(null)}
        />
      )}
    </main>
  );
}
