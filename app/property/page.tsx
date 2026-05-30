"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function PropertyPage() {
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "property"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((i: any) => i.status === "live");
      items.sort((a: any, b: any) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load property:", err); });
    return () => unsub();
  }, []);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(244,63,94,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/15 bg-rose-500/5 px-3.5 py-1 text-[10px] font-semibold text-rose-400 mb-4 tracking-wide uppercase">Property</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">Property</span>
            </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Find homes, apartments, land, and commercial property across New Zealand. Buy, auction, or enquire.
          </p>
          <Link href="/post/ai?type=property" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-rose-500/30 hover:scale-105 active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            List Property
          </Link>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-6 rounded-2xl border border-rose-500/10 bg-gradient-to-b from-rose-500/[0.03] to-transparent p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-rose-400">📖 How It Works</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-sm">🔍</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Browse Listings</p>
                <p className="mt-0.5 text-xs text-zinc-500">Find property for sale or auction across New Zealand.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-sm">💰</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Buy or Bid</p>
                <p className="mt-0.5 text-xs text-zinc-500">Purchase directly or place a bid on auction listings.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-sm">💬</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Contact Seller</p>
                <p className="mt-0.5 text-xs text-zinc-500">Message the seller to arrange viewings and negotiate.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-sm">✅</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Settle Securely</p>
                <p className="mt-0.5 text-xs text-zinc-500">Payment and settlement handled securely through Sky Drop.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Warning */}
        <div className="mb-10 rounded-xl border border-red-500/10 bg-red-500/[0.03] p-4">
          <p className="text-xs text-red-400/80">
            ⚠️ <span className="font-bold text-red-400">Stay safe.</span> Never pay outside Sky Drop. Keep all communication in our chat. Report suspicious behaviour immediately.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🏠</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No property listed yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to list a property.</p>
            <Link href="/post/ai?type=property" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-rose-500/30 hover:scale-105 active:scale-95">
              List Property
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((item) => (
              <Link key={item.id} href={`/post/listing/${item.id}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.04] hover:border-rose-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(244,63,94,0.15)]">
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-rose-900/20 to-pink-900/20">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt={item.title} className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-30">🏠</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 left-3 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold text-rose-400 backdrop-blur-sm">Property</div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-rose-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.propertyType || "Property"}</p>
                    </div>
                    <span className="shrink-0 text-lg font-black text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.3)]">${item.price}</span>
                  </div>

                  <div className="mt-2 text-[10px] text-zinc-500">
                    {item.bedrooms && <span>{item.bedrooms} bed</span>}
                    {item.bathrooms && <span> · {item.bathrooms} bath</span>}
                    {item.landArea && <span> · {item.landArea}m²</span>}
                    {item.location && <span> · {item.location}</span>}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <span className="text-[11px] text-zinc-500">{item.saleType?.includes("auction") ? "Auction" : "For Sale"}</span>
                    <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-[11px] font-bold text-rose-400 transition-all duration-200 group-hover:bg-rose-500/20 group-hover:scale-105 active:scale-95">
                      View
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
