"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../lib/firebase";
import { getFreshIdToken } from "../lib/api-auth";
import { trackFunnelEvent } from "../lib/funnel-events";
import { sellerMessagesUrl } from "../lib/public-display";
import { showToast } from "./Toast";
import AnimatedCheckmark from "./AnimatedCheckmark";
import { logModalMounted } from "../lib/purchase-flow-debug";

interface ListingData {
  id?: string;
  title: string;
  price: string;
  images?: string[];
  imageUrl?: string;
  image?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  pickupArea?: string;
  paymentType?: string;
}

interface ArrangePurchaseModalProps {
  listing: ListingData;
  buyerEmail: string;
  onClose: () => void;
  onSuccess?: (conversationId: string) => void;
}

type ArrangeStep = "intro" | "confirm" | "processing" | "success" | "error";

const ARRANGE_STEPS = [
  { key: "intro", label: "Start", icon: "📝" },
  { key: "confirm", label: "Confirm", icon: "✅" },
  { key: "processing", label: "Connect", icon: "⏳" },
  { key: "success", label: "Complete", icon: "🤝" },
];

export default function ArrangePurchaseModal({ listing, buyerEmail, onClose, onSuccess }: ArrangePurchaseModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ArrangeStep>("intro");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");

  const imageSrc = listing.images?.[0] || listing.imageUrl || listing.image || "";

  useEffect(() => {
    logModalMounted("ArrangePurchaseModal", {
      listingId: listing.id ?? null,
      listingPaymentType: listing.paymentType ?? null,
    });
  }, [listing.id, listing.paymentType]);

  function getCurrentStepIndex(): number {
    const stepIndexMap: Record<ArrangeStep, number> = { intro: 0, confirm: 1, processing: 2, success: 3, error: 2 };
    return stepIndexMap[step] || 0;
  }

  async function handleArrangePurchase() {
    if (!message.trim()) {
      setError("Please enter a message for the seller");
      return;
    }

    setLoading(true);
    setError("");
    setStep("processing");

    try {
      const token = await getFreshIdToken();
      if (!token) {
        setError("Please sign in again");
        setStep("intro");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/arrange-purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingId: listing.id,
          collectionName: "listings",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to arrange purchase");
      }

      setConversationId(data.conversationId);
      setStep("success");
      const uid = auth.currentUser?.uid;
      if (uid) {
        trackFunnelEvent({
          event: "purchase_completed",
          userId: uid,
          listingId: listing.id,
        });
      }

      // Send initial message
      if (data.conversationId && listing.sellerEmail) {
        await fetch("/api/checkout-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: message.trim(),
            sellerEmail: listing.sellerEmail,
            listingId: listing.id,
          }),
        }).catch((e) => console.error("Failed to send message:", e));
      }

      if (onSuccess) {
        onSuccess(data.conversationId);
      }
    } catch (e: any) {
      console.error("[ArrangePurchaseModal] error:", e);
      setError(e.message || "Failed to arrange purchase");
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  function safeClose() {
    onClose();
  }

  // Add ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6"
      onClick={safeClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl max-h-[90vh] overflow-y-auto my-4 sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "success" ? (
          <div className="flex flex-col px-6 py-8 text-center relative overflow-hidden">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20">
              <AnimatedCheckmark />
            </div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Purchase Request Sent</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">The seller will contact you shortly</p>

            {/* TradeMe-style Next Steps */}
            <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-left">
              <p className="text-[11px] font-bold text-sky-400 mb-2">What happens next?</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">1️⃣</span>
                  <p className="text-[10px] text-sky-400/80">Seller will confirm your purchase request</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">2️⃣</span>
                  <p className="text-[10px] text-sky-400/80">You'll receive payment details in the chat</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">3️⃣</span>
                  <p className="text-[10px] text-sky-400/80">Complete payment and arrange pickup/shipping</p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <button
                onClick={() => router.push(sellerMessagesUrl(listing, listing.id))}
                className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400"
              >
                Open Chat
              </button>
              <button
                onClick={safeClose}
                className="w-full rounded-xl border border-[var(--card-border)] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        ) : step === "error" ? (
          <div className="flex flex-col px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Request Failed</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{error}</p>
            <div className="mt-5 flex gap-2">
              <button onClick={safeClose} className="flex-1 rounded-xl border border-white/[0.06] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-[var(--card-hover)]">
                Close
              </button>
              <button onClick={() => setStep("intro")} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400">
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--foreground)]">Arrange Purchase</h2>
              <button onClick={safeClose} className="p-2 text-[var(--muted)] transition hover:text-[var(--foreground)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Stepper */}
            <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-3 bg-[var(--soft-card)]">
              {ARRANGE_STEPS.map((stepItem, index) => {
                const currentIndex = getCurrentStepIndex();
                const isCompleted = index < currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <div key={stepItem.key} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all ${
                      isCompleted ? 'bg-sky-500 text-white' : isCurrent ? 'bg-sky-500/20 text-sky-400 ring-2 ring-sky-500/40' : 'bg-[var(--soft-card)] text-[var(--muted)]'
                    }`}>
                      {isCompleted ? '✓' : stepItem.icon}
                    </div>
                    <span className={`text-[10px] font-medium ${
                      isCompleted ? 'text-sky-400' : isCurrent ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'
                    }`}>
                      {stepItem.label}
                    </span>
                    {index < ARRANGE_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${
                        isCompleted ? 'bg-sky-500' : 'bg-white/[0.06]'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Item Summary */}
            <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3">
              {imageSrc && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--soft-card)]">
                  <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--foreground)]">{listing.title}</p>
                <p className="text-xs text-[var(--muted)]">${listing.price}</p>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(90vh - 250px)' }}>
              {/* TradeMe-style Info Banner */}
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">🤝</span>
                  <div>
                    <p className="text-[11px] font-bold text-sky-400">Arrange Purchase</p>
                    <p className="mt-1 text-[10px] text-sky-400/80 leading-relaxed">
                      Contact the seller directly to arrange payment and pickup/shipping. No payment is processed through this platform.
                    </p>
                  </div>
                </div>
              </div>

              {/* Safety Tips */}
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="text-[11px] font-bold text-sky-400">Safety Tips</p>
                    <ul className="mt-1 space-y-1 text-[10px] text-sky-400/80 leading-relaxed">
                      <li>• Meet in safe, public locations for pickup</li>
                      <li>• Check the item before paying</li>
                      <li>• Keep all communication in the chat</li>
                      <li>• Use secure payment methods when possible</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  Message to Seller
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hi, I'm interested in this item. When would be a good time to arrange pickup and payment?"
                  rows={4}
                  className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--soft-card)] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/40 resize-none"
                />
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  This message will be sent to the seller to start the conversation.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-800/40 bg-red-900/20 p-3 text-xs text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 border-t border-[var(--card-border)] bg-[var(--card)] px-4 py-3 flex gap-2">
              <button
                onClick={safeClose}
                disabled={loading}
                className="rounded-xl border border-[var(--card-border)] px-4 py-3 text-sm font-bold text-[var(--muted)] transition hover:border-sky-400 hover:text-[var(--foreground)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArrangePurchase}
                disabled={loading || !message.trim()}
                className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Request"}
              </button>
            </div>

            {step === "processing" && (
              <div className="sticky bottom-0 border-t border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--muted)]">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting with seller...
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
