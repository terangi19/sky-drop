"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import CheckoutModal from "../components/CheckoutModal";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../lib/firebase";

const CATEGORIES = ["All", "Templates & Assets", "E-books & Guides", "Art & Photography", "Software & Audio", "Gaming & 3D"];

export default function DigitalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [category, setCategory] = useState("All");
  const [checkoutPost, setCheckoutPost] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "digital"), where("status", "==", "live"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load digital listings:", err); alert("Failed to load digital listings — check Firestore indexes"); });
    return () => unsub();
  }, []);

  const filtered = category === "All" ? listings : listings.filter((l) => l.category === category);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/5 px-3 py-1 text-[11px] font-semibold text-sky-400 mb-4 tracking-wide uppercase">Curated Collection</div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Digital <span className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">Store</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            The Digital Store is Sky Drop's marketplace for premium instant-download products. Browse templates, software, design assets, e-books, and creative tools — delivered directly to you on purchase.
          </p>
          <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:scale-105 active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Create Listing
          </Link>
        </div>

        {/* Category filters */}
        <div className="mb-8 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 ${
                category === c
                  ? "bg-gradient-to-r from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/25"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}>
              {c}
            </button>
          ))}
        </div>

        {/* Listing grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/60 to-zinc-900/20 p-16 text-center backdrop-blur-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/60 text-3xl">📦</div>
            <p className="text-lg font-bold text-[var(--foreground)]">Nothing here yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Be the first to list a digital product in this category.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-zinc-800/40 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 transition-all duration-500 hover:border-sky-500/30 hover:shadow-[0_0_30px_rgba(14,165,233,0.1)] hover:-translate-y-1">
                {/* Preview image */}
                <div className="relative h-40 overflow-hidden bg-gradient-to-br from-zinc-800/80 to-zinc-900/80">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt="" className="h-full w-full object-contain p-6 transition-all duration-500 group-hover:scale-110 group-hover:brightness-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-40">✦</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                {/* Info */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-sky-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.category}</p>
                    </div>
                    <span className="shrink-0 text-lg font-black text-sky-400 drop-shadow-[0_0_8px_rgba(14,165,233,0.3)]">${item.price}</span>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <Link href={`/seller/${item.sellerUsername || item.sellerEmail}`} className="text-[11px] text-zinc-500 hover:text-sky-400 transition-colors">
                      {item.sellerUsername || item.sellerEmail?.split("@")[0] || "Seller"}
                    </Link>
                    {user && user.email !== item.sellerEmail && (
                      <button onClick={() => setCheckoutPost(item)}
                        className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:scale-105 active:scale-95">
                        Buy Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {checkoutPost && user?.email && (
        <CheckoutModal collectionName="listings" listing={{
          id: checkoutPost.id, title: checkoutPost.title, price: String(checkoutPost.price || 0),
          images: checkoutPost.images || (checkoutPost.image ? [checkoutPost.image] : []),
          sellerEmail: checkoutPost.sellerEmail, sellerUsername: checkoutPost.sellerUsername,
          type: "digital",
          digitalFileURL: checkoutPost.digitalFileURL,
          digitalFileName: checkoutPost.digitalFileName,
          digitalStoragePath: checkoutPost.digitalStoragePath,
        }} buyerEmail={user.email} onClose={() => setCheckoutPost(null)} />
      )}
    </main>
  );
}
