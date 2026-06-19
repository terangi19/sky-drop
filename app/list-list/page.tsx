"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import BrowseAwhinaAssistantPanel from "../components/BrowseAwhinaAssistantPanel";
import { useAwhinaInsightEffect } from "../contexts/AwhinaPageInsightContext";
import { buildListListInsight } from "../lib/awhina-insights";
import { showToast } from "../components/Toast";
import { isListingVisibleInMarketplace } from "../lib/listing-availability";
import PromoteModal from "../components/PromoteModal";
import { LISTING_GRID, PAGE_SHELL_CHAT } from "../lib/page-layout";

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

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return `${Math.floor(diff / 604800000)}w ago`;
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
    }, (error) => {
      console.error(error);
      if (!cancelled) setLoading(false);
      showToast("Failed to load listings: " + error.message, "error");
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
    }, (error) => {
      console.error(error);
      if (!cancelled) setLoading(false);
      showToast("Failed to load trade posts: " + error.message, "error");
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
      showToast("You can only delete your own listings", "error");
      return;
    }
    const col = (listing as any)._collection === "tradePosts" ? "tradePosts" : "listings";
    try {
      await deleteDoc(doc(db, col, id));
    } catch (error) {
      console.error(error);
      showToast("Failed to delete", "error");
    }
  };

  const filteredListings = useMemo(() => {
    let items = listings;
    if (activeTab === "active") items = items.filter((i) => isListingVisibleInMarketplace(i));
    if (activeTab === "sold") items = items.filter((i) => !isListingVisibleInMarketplace(i));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.title?.toLowerCase().includes(q));
    }
    return items;
  }, [listings, activeTab, search]);

  const activeCount = listings.filter((i) => isListingVisibleInMarketplace(i)).length;
  const soldCount = listings.filter((i) => !isListingVisibleInMarketplace(i)).length;

  const awhinaInsight = useMemo(
    () =>
      buildListListInsight({
        listings,
        onBoost: (listing) => setPromoteItem(listing as Listing),
      }),
    [listings]
  );
  useAwhinaInsightEffect(awhinaInsight);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <div className={`${PAGE_SHELL_CHAT} py-8 sm:py-12`}>

        {/* Header */}
        <div className="mb-8 sm:mb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4 sm:mb-5">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <div className="relative flex flex-col items-center gap-4">
            <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-sky-500/5 to-transparent blur-3xl pointer-events-none" />
            <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
              <span className="text-white drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">My Listings</span>
            </h1>
            <BrowseAwhinaAssistantPanel className="mt-4 mb-0 mx-auto w-full max-w-2xl text-left" />
            <p className="relative text-sm text-zinc-500">
              {listings.length} total · {activeCount} active · {soldCount} sold
            </p>
            <Link href="/post/ai" className="relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Listing
            </Link>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 sm:mb-8">
          <div className="flex gap-1 rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
            {(["active", "all", "sold"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  activeTab === tab
                    ? "bg-gradient-to-b from-sky-500/20 to-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.06)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {tab === "active" ? `Active (${activeCount})` : tab === "all" ? `All (${listings.length})` : `Sold (${soldCount})`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder="Search listings..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className={LISTING_GRID}>
            {[1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-white/[0.03]" />
                <div className="p-5 space-y-3">
                  <div className="h-4 w-16 rounded-md bg-white/[0.03]" />
                  <div className="h-5 w-3/4 rounded-md bg-white/[0.03]" />
                  <div className="h-6 w-1/3 rounded-md bg-white/[0.03]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filteredListings.length === 0 && (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No listings yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Create your first listing and it will appear here.</p>
            <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.97]">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Create Listing
            </Link>
          </div>
        )}

        {/* Listings grid */}
        <div className={LISTING_GRID}>
          {filteredListings.map((item) => {
            const isOwner = user && item.sellerEmail === user.email;
            const imgSrc = item.images?.[0] || item.imageUrl || item.image || "";
            const isExpired = item.expiresAt?.toMillis?.() < Date.now();
            const isSold = !isListingVisibleInMarketplace(item);
            return (
              <div key={item.id}
                className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.04] hover:border-sky-500/30 hover:shadow-[0_10px_40px_-10px_rgba(14,165,233,0.12)] cursor-pointer ${isSold || isExpired ? "opacity-60" : ""}`}
                onClick={() => router.push(item.type === "service" ? "/services" : item.type === "event" ? "/events" : item.type === "vehicle" ? "/vehicles" : item.type === "job" ? "/jobs" : item.type === "property" ? "/property" : item.type === "digital" ? "/digital" : item.type === "rental" ? "/rentals" : `/post/listing/${item.id}`)}
              >
                {/* Image */}
                <div className="relative shrink-0 overflow-hidden">
                  {imgSrc ? (
                    <img src={imgSrc} alt={item.title} loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      className="aspect-[4/3] w-full object-cover transition-all duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-sky-500/5 via-sky-500/5 to-sky-600/5">
                      <div className="text-center">
                        <div className="text-3xl font-black tracking-tighter text-zinc-600">SD</div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-700">Sky Drop</div>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    {item.promotedUntil?.toMillis?.() > Date.now() && (
                      <span className="rounded-full bg-sky-500/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg">📈 Promoted</span>
                    )}
                    {isSold && (
                      <span className="rounded-full bg-red-500/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-white shadow-lg">Sold</span>
                    )}
                    {isExpired && !isSold && (
                      <span className="rounded-full bg-zinc-700/90 backdrop-blur-sm px-2.5 py-0.5 text-[9px] font-bold text-zinc-300 shadow-lg">Expired</span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/10">
                        {item.category || "Other"}
                      </span>
                    </div>
                    {(item as any).type && (
                      <span className="shrink-0 text-[10px] text-zinc-500">{(item as any).type}</span>
                    )}
                  </div>

                  <h2 className="mt-3 line-clamp-1 text-[16px] font-black tracking-tight text-[var(--foreground)] group-hover:text-sky-400 transition-colors duration-150">
                    {item.title}
                  </h2>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl font-black text-sky-400">${item.price}</span>
                    {isSold && <span className="text-[10px] text-red-400 font-semibold">Sold</span>}
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {item.views || 0}
                    </span>
                    {item.createdAt?.toDate && (
                      <span>{timeAgo(item.createdAt.toDate())}</span>
                    )}
                  </div>

                  {/* Actions */}
                  {isOwner && (
                    <div className="mt-auto flex min-h-10 gap-2 border-t border-white/[0.06] pt-3">
                      {(item as any)._collection !== "tradePosts" && (
                        <button onClick={(e) => { e.stopPropagation(); setPromoteItem(item); }}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-sky-500/10 px-2 py-2.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20 active:scale-[0.97]">
                          📈 Boost
                        </button>
                      )}
                      {(item as any)._collection !== "tradePosts" && (
                        <Link href={`/post/ai?edit=${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-2.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-300 active:scale-[0.97]">
                          Edit
                        </Link>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-red-500/15 bg-red-500/5 px-2 py-2.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/15 active:scale-[0.97]">
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

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-center text-lg font-black text-[var(--foreground)]">Delete this listing?</h3>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={async () => { await deleteListing(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-400 active:scale-[0.97] transition-all">Delete</button>
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
