"use client";

import { useEffect, useState } from "react";
import { doc, Timestamp, updateDoc } from "firebase/firestore";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import stripePromise from "../lib/stripe-client";
import { auth, db } from "../lib/firebase";
import { showToast } from "./Toast";
import AnimatedCheckmark from "./AnimatedCheckmark";
import { playConfetti, playSuccess } from "../lib/sounds";

interface PromoteModalProps {
  listing: { id: string; title: string; price?: string; images?: string[]; image?: string };
  collectionName?: string;
  onClose: () => void;
}

function BumpForm({ listingId, collectionName, onSuccess }: { listingId: string; collectionName: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError("");

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/checkout/success` },
      redirect: "if_required",
    });

    if (submitError) {
      setError("Payment failed. Try again.");
    } else {
      try {
        await updateDoc(doc(db, collectionName, listingId), {
          promotedUntil: Timestamp.fromMillis(Date.now() + 7 * 86400000),
        });
        onSuccess();
      } catch (e) { console.error(e); setError("Failed to activate promotion."); }
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button type="submit" disabled={!stripe}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50">
        Pay $5.00
      </button>
    </form>
  );
}

export default function PromoteModal({ listing, collectionName = "listings", onClose }: PromoteModalProps) {
  const [step, setStep] = useState<"confirm" | "card" | "success">("confirm");
  const [clientSecret, setClientSecret] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (step === "success") {
      playSuccess();
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(t);
    }
  }, [step]);

  async function handleStart() {
    setStep("card");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/create-bump-intent", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) } });
      const data = await res.json();
      if (data.clientSecret) setClientSecret(data.clientSecret);
      else { setStep("confirm"); showToast("Payment service unavailable.", "error"); }
    } catch { setStep("confirm"); showToast("Could not connect.", "error"); }
  }

  const imageSrc = listing.images?.[0] || listing.image || "";

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
        {showConfetti && (
          <div className="absolute inset-0 z-50 pointer-events-none">
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} className="absolute h-2 w-2 rounded-full animate-confetti-particle"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  background: ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#ec4899"][Math.floor(Math.random() * 6)],
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${0.6 + Math.random() * 0.8}s`,
                }}
              />
            ))}
          </div>
        )}
        {step === "success" ? (
          <div className="flex flex-col items-center px-6 py-10 text-center animate-fade-in-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <AnimatedCheckmark />
            </div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Promoted!</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Your listing is now boosted to the top for 7 days.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Done</button>
          </div>
        ) : step === "card" && clientSecret ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Promote Listing</h2>
              <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <BumpForm listingId={listing.id} collectionName={collectionName} onSuccess={() => setStep("success")} />
            </Elements>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Promote This Listing</h2>
              <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">✕</button>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-zinc-900/40 p-3 text-xs">
              {imageSrc && <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-800 overflow-hidden"><img src={imageSrc} className="h-full w-full object-cover" /></div>}
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{listing.title}</p>{listing.price && <p className="text-[var(--muted)]">${listing.price}</p>}</div>
            </div>
            <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 px-4 py-3 text-xs space-y-1">
              <p className="font-bold text-sky-400">📈 $5 for 7 days of top placement</p>
              <p className="text-[var(--muted)]">Your listing will appear above non-promoted listings in search and feeds.</p>
            </div>
            <button onClick={handleStart} className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">
              Promote Now — $5
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
