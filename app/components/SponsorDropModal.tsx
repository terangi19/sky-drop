"use client";

import { useEffect, useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import stripePromise from "../lib/stripe-client";
import { collection, addDoc, doc, getDoc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { showToast } from "./Toast";

interface SponsorDropModalProps {
  listing: { id: string; title: string; price?: string; images?: string[]; image?: string; imageUrl?: string };
  sellerEmail: string;
  userId: string;
  onClose: () => void;
}

function PaymentForm({ listingId, listingTitle, sellerEmail, userId, targetPage, onSuccess }: {
  listingId: string; listingTitle: string; sellerEmail: string; userId: string; targetPage: string; onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError("");

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/dashboard` },
      redirect: "if_required",
    });

    if (submitError) {
      setError("Payment failed. Try again.");
    } else {
      try {
        await addDoc(collection(db, "sponsoredDrops"), {
          listingId,
          listingTitle,
          sellerEmail,
          sellerUid: userId,
          targetPage,
          status: "pending",
          paid: true,
          createdAt: serverTimestamp(),
        });
        for (let i = 0; i < 2; i++) {
          await addDoc(collection(db, "dropTokens"), {
            ownerId: userId,
            ownerEmail: sellerEmail,
            originDropId: "sponsor_reward",
            status: "available",
            createdAt: serverTimestamp(),
          });
        }

        const listingRef = doc(db, "listings", listingId);
        const listingSnap = await getDoc(listingRef);
        const currentPromoted = listingSnap.data()?.promotedUntil?.toMillis?.() || 0;
        const baseTime = Math.max(Date.now(), currentPromoted);
        await updateDoc(listingRef, {
          promotedUntil: Timestamp.fromMillis(baseTime + 3 * 86400000),
        });

        onSuccess();
      } catch {
        setError("Failed to activate sponsorship.");
      }
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={!stripe}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50">
        Pay $5.00 — Sponsor Drop
      </button>
    </form>
  );
}



export default function SponsorDropModal({ listing, sellerEmail, userId, onClose }: SponsorDropModalProps) {
  const [step, setStep] = useState<"confirm" | "card" | "success">("confirm");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const imageSrc = listing.images?.[0] || listing.imageUrl || listing.image || "";
  const targetPage = `/post/listing/${listing.id}`;

  async function handleStart() {
    setStep("card");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/sponsor-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ listingId: listing.id, listingTitle: listing.title, sellerEmail, targetPage }),
      });
      const data = await res.json();
      if (data.clientSecret) setClientSecret(data.clientSecret);
      else { setStep("confirm"); showToast("Payment service unavailable.", "error"); }
    } catch { setStep("confirm"); showToast("Could not connect.", "error"); }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in-backdrop" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
        {step === "success" ? (
          <div className="flex flex-col items-center px-6 py-10 text-center animate-fade-in-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20 text-2xl">🎁</div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Drop Sponsored!</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Your listing is now <strong className="text-sky-400">promoted with an orange glow</strong> for 3 days and will appear as the next drop target.
            </p>
            <button onClick={onClose} className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Done</button>
          </div>
        ) : step === "card" && clientSecret ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">🎁 Sponsor a Drop</h2>
              <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm listingId={listing.id} listingTitle={listing.title} sellerEmail={sellerEmail} userId={userId} targetPage={targetPage} onSuccess={() => setStep("success")} />
            </Elements>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">🎁 Sponsor a Drop</h2>
              <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-zinc-900/40 p-3 text-xs">
              {imageSrc && <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-800 overflow-hidden"><img src={imageSrc} className="h-full w-full object-cover" /></div>}
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{listing.title}</p>{listing.price && <p className="text-[var(--muted)]">${listing.price}</p>}</div>
            </div>
            <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 px-4 py-3 text-xs space-y-1">
              <p className="font-bold text-sky-400">🎁 $5 for one drop placement</p>
              <p className="text-[var(--muted)]">Your listing becomes the next drop target. Users hunting for the 🎁 will be sent directly to your page.</p>
            </div>
            <button onClick={handleStart} className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">
              Sponsor Now — $5
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
