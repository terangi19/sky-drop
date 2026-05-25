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
    const q = query(collection(db, "tradePosts"), where("type", "==", "digital"), where("status", "==", "live"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Failed to load digital listings:", err));
    return () => unsub();
  }, []);

  const filtered = category === "All" ? listings : listings.filter((l) => l.category === category);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-black">📥 Digital Assets</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Instant-download templates, e-books, art, software, and more.</p>
        </div>

        {/* Category filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${category === c ? "bg-sky-500 text-[var(--foreground)]" : "border border-zinc-700 text-[var(--muted)] hover:border-zinc-600"}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Listing grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-12 text-center">
            <p className="text-3xl mb-3">📦</p>
            <p className="font-bold">No digital assets found</p>
            <p className="text-sm text-[var(--muted)] mt-1">Check back later or try a different category.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/60 transition-all duration-300 hover:border-sky-500/30 hover:shadow-[0_0_20px_rgba(14,165,233,0.08)] hover:-translate-y-0.5">
                {/* Preview image */}
                <div className="relative h-36 overflow-hidden bg-zinc-800/50">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt="" className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">📥</div>
                  )}
                  <div className="absolute top-2 right-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400 backdrop-blur-sm">📥 Digital</div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)]">{item.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{item.category}</p>
                    </div>
                    <span className="shrink-0 text-lg font-black text-sky-400">${item.price}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <Link href={`/seller/${item.sellerUsername || item.sellerEmail}`} className="text-[10px] text-[var(--muted)] hover:text-sky-400 transition-colors">
                      {item.sellerUsername || item.sellerEmail?.split("@")[0] || "Seller"}
                    </Link>
                    {user && user.email !== item.sellerEmail && (
                      <button onClick={() => setCheckoutPost(item)}
                        className="rounded-lg bg-sky-500 px-4 py-1.5 text-[10px] font-bold text-[var(--foreground)] transition hover:bg-sky-400">
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
        <CheckoutModal collectionName="tradePosts" listing={{
          id: checkoutPost.id, title: checkoutPost.title, price: String(checkoutPost.price || 0),
          images: checkoutPost.images || (checkoutPost.image ? [checkoutPost.image] : []),
          sellerEmail: checkoutPost.sellerEmail, sellerUsername: checkoutPost.sellerUsername,
          type: "digital",
          digitalFileURL: checkoutPost.digitalFileURL,
          digitalFileName: checkoutPost.digitalFileName,
        }} buyerEmail={user.email} onClose={() => setCheckoutPost(null)} />
      )}
    </main>
  );
}
