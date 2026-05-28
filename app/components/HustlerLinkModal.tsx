"use client";

import { useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { showToast } from "./Toast";

interface Props {
  listingId: string;
  listingTitle: string;
  sellerId: string;
  promoterId: string;
  promoId?: string;
  onClose: () => void;
}

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function HustlerLinkModal({ listingId, listingTitle, sellerId, promoterId, promoId, onClose }: Props) {
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);

  async function getOrCreateLink() {
    setCreating(true);
    try {
      const linkId = `${promoterId}_${listingId}`;
      const existing = await getDoc(doc(db, "hustlerLinks", linkId));
      if (existing.exists()) {
        setCode(existing.data().code);
      } else {
        const c = generateCode();
        await setDoc(doc(db, "hustlerLinks", linkId), {
          promotionId: promoId || null,
          listingId,
          promoterId,
          sellerId,
          code: c,
          clicks: 0,
          conversions: 0,
          createdAt: serverTimestamp(),
        });
        setCode(c);
      }
    } catch (e) {
      console.error("Failed to create hustler link:", e);
      showToast("Failed to create link", "error");
    }
    setCreating(false);
  }

  const link = code ? `${window.location.origin}/post/listing/${listingId}?ref=${code}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.06] bg-zinc-950/95 backdrop-blur-xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[var(--foreground)]">🚀 Promote & Earn</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-[var(--foreground)] transition">✕</button>
        </div>

        <p className="text-xs text-zinc-500 mb-4">
          Get your unique referral link for <span className="font-bold text-[var(--foreground)]">{listingTitle}</span>. Share it anywhere — when someone buys through your link, you earn commission.
        </p>

        {!code ? (
          <button onClick={getOrCreateLink} disabled={creating}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50">
            {creating ? "Generating..." : "🔗 Get Your Link"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 select-all break-all text-xs text-sky-400 font-mono">
              {link}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(link); showToast("Link copied!", "success"); }}
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
              📋 Copy Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
