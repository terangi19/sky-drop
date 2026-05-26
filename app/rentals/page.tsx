"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function RentalsPage() {
  const [listings, setListings] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "rental"), where("status", "==", "live"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load rentals:", err); });
    return () => unsub();
  }, []);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-3.5 py-1 text-[10px] font-semibold text-emerald-400 mb-4 tracking-wide uppercase">Rentals</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Rentals</span>
            </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Rent items by the day — tools, cameras, equipment, and more. Pick up locally and return when you&apos;re done.
          </p>
          <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105 active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            List a Rental
          </Link>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🔑</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No rentals listed yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to list something for rent.</p>
            <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-105 active:scale-95">
              List a Rental
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {listings.map((item) => (
              <Link key={item.id} href={`/post/listing/${item.id}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.04] hover:border-emerald-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.15)]">
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-emerald-900/20 to-teal-900/20">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt="" className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-30">🔑</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 left-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 backdrop-blur-sm">Rental</div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-emerald-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.location || item.condition}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">${item.price}<span className="text-xs text-zinc-500 font-medium">/day</span></span>
                      {item.rentalPriceWeekly && <p className="text-[10px] text-zinc-500">${item.rentalPriceWeekly}/wk</p>}
                      {item.rentalPriceMonthly && <p className="text-[10px] text-zinc-500">${item.rentalPriceMonthly}/mo</p>}
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-zinc-500">{item.condition || "Good"}{item.rentalDeposit ? ` · $${item.rentalDeposit} deposit` : ""}</div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <span className="text-[11px] text-zinc-500">{item.location || "Pickup"}</span>
                    <Link href={`/post/listing/${item.id}`} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[11px] font-bold text-emerald-400 transition-all duration-200 hover:bg-emerald-500/20 hover:scale-105 active:scale-95">
                      Rent Now
                    </Link>
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
