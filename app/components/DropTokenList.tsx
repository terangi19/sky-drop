"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { showToast } from "./Toast";

interface DropToken {
  id: string;
  ownerId: string;
  ownerEmail: string;
  status: "available" | "used";
  createdAt?: any;
}

interface UserListing {
  id: string;
  title: string;
  price?: string;
  image?: string;
  images?: string[];
  imageUrl?: string;
}

export default function DropTokenList({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [tokens, setTokens] = useState<DropToken[]>([]);
  const [listings, setListings] = useState<UserListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "dropTokens"), where("ownerId", "==", userId));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DropToken));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setTokens(items);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, "listings"), where("sellerEmail", "==", userEmail));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserListing));
      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      setListings(items);
    });
    return () => unsub();
  }, [userEmail]);

  async function handleSelectListing(listingId: string) {
    if (!selectedToken || applying) return;
    setApplying(true);
    try {
      await updateDoc(doc(db, "dropTokens", selectedToken), { status: "used" });
      await updateDoc(doc(db, "listings", listingId), {
        promotedUntil: Timestamp.fromMillis(Date.now() + 7 * 86400000),
      });
      showToast("Listing boosted! 📈", "success");
      setShowPicker(false);
      setSelectedToken(null);
    } catch (e) {
      showToast("Failed to apply token", "error");
      console.error(e);
    }
    setApplying(false);
  }

  const available = tokens.filter((t) => t.status === "available");

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="h-4 w-32 rounded bg-zinc-800 animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--foreground)]">🎁 Drop Tokens</h2>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">{available.length} available</span>
        </div>
        {available.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No Drop Tokens yet. Find drops to earn free boosts!</p>
        ) : (
          <button
            onClick={() => { setSelectedToken(available[0].id); setShowPicker(true); }}
            className="flex w-full items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/20 px-4 py-3 transition hover:border-sky-500/40 hover:bg-sky-500/5"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🎁</span>
              <span className="text-sm font-bold text-[var(--foreground)]">Use a Drop Token</span>
            </div>
            <span className="rounded-lg bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-400">Use</span>
          </button>
        )}
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPicker(false)}>
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl animate-fade-in-up max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-bold text-[var(--foreground)] mb-1">Choose a listing to boost</h2>
            <p className="text-xs text-[var(--muted)] mb-4">Your listing will be promoted for 7 days for free.</p>
            <div className="space-y-2 overflow-y-auto flex-1">
              {listings.length === 0 ? (
                <p className="text-xs text-[var(--muted)] text-center py-8">You have no listings yet.</p>
              ) : (
                listings.map((listing) => {
                  const imgSrc = listing.images?.[0] || listing.imageUrl || listing.image || "";
                  return (
                    <button
                      key={listing.id}
                      onClick={() => handleSelectListing(listing.id)}
                      disabled={applying}
                      className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-sky-500/50 disabled:opacity-50"
                    >
                      {imgSrc ? (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                          <img src={imgSrc} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-lg">📦</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[var(--foreground)]">{listing.title}</p>
                        {listing.price && <p className="text-xs text-[var(--muted)]">${listing.price}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-sky-400">{applying ? "..." : "Boost →"}</span>
                    </button>
                  );
                })
              )}
            </div>
            <button onClick={() => setShowPicker(false)} className="mt-4 w-full rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-[var(--muted)] hover:text-[var(--foreground)]">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
