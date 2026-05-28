"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

const CATEGORIES = ["All", "Concerts & Gigs", "Festivals", "Sports", "Workshops & Classes", "Community", "Food & Drink", "Other"];

export default function EventsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "event"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((i: any) => i.status === "live");
      items.sort((a: any, b: any) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load events:", err); });
    return () => unsub();
  }, []);

  const filtered = category === "All" ? listings : listings.filter((l) => l.category === category);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(234,179,8,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/15 bg-yellow-500/5 px-3.5 py-1 text-[10px] font-semibold text-yellow-400 mb-4 tracking-wide uppercase">Events & Tickets</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">Events</span>
            </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Find tickets for concerts, festivals, workshops, sports, and local events near you. Buy securely and show up.
          </p>
          <Link href="/post/ai?type=event" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-yellow-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-yellow-500/30 hover:scale-105 active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            List an Event
          </Link>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-6 rounded-2xl border border-yellow-500/10 bg-gradient-to-b from-yellow-500/[0.03] to-transparent p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-yellow-400">📖 How It Works</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-sm">🔍</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Find Events</p>
                <p className="mt-0.5 text-xs text-zinc-500">Browse concerts, festivals, workshops and sports events.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-sm">🎟</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Select Tickets</p>
                <p className="mt-0.5 text-xs text-zinc-500">Choose the event and number of tickets you need.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-sm">💳</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Buy Securely</p>
                <p className="mt-0.5 text-xs text-zinc-500">Checkout is handled securely through Stripe.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-sm">✅</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Show Up</p>
                <p className="mt-0.5 text-xs text-zinc-500">Coordinate with the seller through chat for delivery or pickup.</p>
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

        {/* Category filters */}
        <div className="mb-8 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 ${
                category === c
                  ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-500/25"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}>
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🎟</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No events listed yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to list an event.</p>
            <Link href="/post/ai?type=event" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-yellow-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-yellow-500/30 hover:scale-105 active:scale-95">
              List an Event
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <Link key={item.id} href={`/post/listing/${item.id}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.04] hover:border-yellow-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(234,179,8,0.15)]">
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-yellow-900/20 to-orange-900/20">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt="" className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-30">🎟</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 left-3 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[9px] font-bold text-yellow-400 backdrop-blur-sm">Event</div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-yellow-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.category}</p>
                    </div>
                    <span className="shrink-0 text-lg font-black text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.3)]">${item.price}</span>
                  </div>

                  <div className="mt-2 text-[10px] text-zinc-500">
                    {item.eventDate && (
                      <span>{new Date(item.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                    )}
                    {item.eventTime && <span> · {item.eventTime}</span>}
                    {item.venue && <span> · {item.venue}</span>}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <span className="text-[11px] text-zinc-500">{item.ticketType || "General Admission"}{item.ticketQuantity ? ` · ${item.ticketQuantity} left` : ""}</span>
                    <span className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-1.5 text-[11px] font-bold text-yellow-400 transition-all duration-200 group-hover:bg-yellow-500/20 group-hover:scale-105 active:scale-95">
                      Buy Tickets
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
