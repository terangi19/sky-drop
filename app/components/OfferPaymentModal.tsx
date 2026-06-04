"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import stripePromise from "../lib/stripe-client";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { createNotification } from "../lib/notifications";
import { calculateTrustScore } from "../lib/trustscore";
import { playSuccess } from "../lib/sounds";
import AnimatedCheckmark from "./AnimatedCheckmark";
import { isListingAvailableForPurchase } from "../lib/listing-availability";

interface Props {
  amount: number;
  listingTitle: string;
  listingId: string;
  sellerEmail: string;
  buyerEmail: string;
  listingImage?: string;
  listingPrice?: string;
  purchaseId?: string;
  onSuccess: (purchaseId: string) => void;
  onClose: () => void;
}

function PaymentForm({ total, listingId, title, buyerEmail, sellerEmail, onSuccess, onBack }: {
  total: number; listingId: string; title: string; buyerEmail: string; sellerEmail: string; onSuccess: (id: string) => void; onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");

  const [submitting, setSubmitting] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?listingId=${encodeURIComponent(listingId)}&title=${encodeURIComponent(title)}&price=${encodeURIComponent(String(total))}&buyerEmail=${encodeURIComponent(buyerEmail)}&sellerEmail=${encodeURIComponent(sellerEmail)}&type=service`,
      },
      redirect: "if_required",
    });

    setSubmitting(false);
    if (submitError) {
      setError("Payment failed. Please try another card or try again.");
    } else {
      onSuccess(listingId);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-3">
      <PaymentElement />
      {error && (
        <div className="rounded-lg border border-red-800/40 bg-red-900/20 p-3 text-xs text-red-400">{error}</div>
      )}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Payments protected by <span className="font-semibold tracking-tight">Stripe</span>
      </div>
      <button type="submit" disabled={!stripe || submitting}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
        {submitting ? "Processing..." : `Pay $${total.toFixed(2)}`}
      </button>
      <button type="button" onClick={onBack}
        className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 transition hover:border-zinc-600 hover:text-white">
        Cancel
      </button>
    </form>
  );
}

export default function OfferPaymentModal({ amount, listingTitle, listingId, sellerEmail, buyerEmail, listingImage, listingPrice, purchaseId: initialPurchaseId, onSuccess, onClose }: Props) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<"form" | "card" | "processing" | "success">("form");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [intentError, setIntentError] = useState("");
  const [purchaseId, setPurchaseId] = useState("");

  const processingFee = 1.00;
  const total = amount + processingFee;
  const isValid = name.trim().length > 0;

  async function handleContinue() {
    if (!isValid || step !== "form") return;
    setStep("card");
    setIntentError("");

    try {
      // Verify listing and price from Firestore
      const listingSnap = await getDoc(doc(db, "listings", listingId));
      if (!listingSnap.exists()) {
        setIntentError("Listing not found.");
        setStep("form");
        return;
      }
      const listingData = listingSnap.data();
      if (!isListingAvailableForPurchase(listingData)) {
        setIntentError("This listing is no longer available.");
        setStep("form");
        return;
      }
      if (listingData.expiresAt?.toMillis?.() < Date.now()) {
        setIntentError("This listing has expired.");
        setStep("form");
        return;
      }
      // For offer payments, the offer amount may differ from listing price — skip price check
      if (!initialPurchaseId) {
        const realPrice = Number(listingData.price);
        if (listingData.type !== "service" && realPrice !== amount) {
          setIntentError("Price has changed. Please ask the seller for an updated offer.");
          setStep("form");
          return;
        }
      }

      // Check seller is not restricted and has acceptable trust
      const profileSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", sellerEmail)));
      if (!profileSnap.empty) {
        const profile = profileSnap.docs[0].data();
        if (profile.restricted) {
          setIntentError("This seller is currently restricted. Payment cannot be processed.");
          setStep("form");
          return;
        }
        const trust = calculateTrustScore({
          emailVerified: profile.emailVerified,
          hasProfile: true,
          hasBio: !!profile.bio,
          hasPhoto: !!profile.photoURL,
          memberSince: profile.memberSince?.toDate?.() || new Date(),
          reportsCount: profile.reportsCount || 0,
          salesCount: profile.salesCount || 0,
        });
        if (trust.score < 40) {
          setIntentError("This seller's trust score is too low. Please contact support.");
          setStep("form");
          return;
        }
      }

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: listingTitle,
          price: String(total),
          listingId,
          imageUrl: listingImage || "",
        }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || "");
      } else {
        setIntentError(data.error || "Payment initialization failed. Please try again.");
        setStep("form");
      }
    } catch {
      setIntentError("Could not connect to payment server. Please try again.");
      setStep("form");
    }
  }

  async function handlePaymentSuccess() {
    setStep("processing");
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { setStep("form"); return; }

      let resultPurchaseId = "";
      let resultOrderId = "";

      if (initialPurchaseId) {
        // Offer payment — purchase already exists, update via /api/pay-offer
        const payRes = await fetch("/api/pay-offer", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            purchaseId: initialPurchaseId,
            stripePaymentIntentId: paymentIntentId || "",
            total,
          }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) {
          console.error("Offer payment failed:", payData.error);
          setStep("form");
          return;
        }
        resultPurchaseId = payData.purchaseId || initialPurchaseId;
        resultOrderId = payData.orderId || "";
      } else {
        // Direct purchase (service buy-now)
        const createRes = await fetch("/api/create-purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            listingId,
            listingTitle,
            listingPrice: listingPrice || String(amount),
            listingImage: listingImage || "",
            sellerEmail,
            buyerName: name.trim(),
            deliveryMethod: "service",
            total,
            processingFee: 1.00,
            type: "service",
            status: "in_progress",
            disputeDeadline: new Date(Date.now() + 7 * 86400000).toISOString(),
            stripePaymentIntentId: paymentIntentId || "",
            collectionName: "listings",
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          console.error("Purchase creation failed:", createData.error);
          setStep("form");
          return;
        }
        resultPurchaseId = createData.purchaseId;

        await createNotification({
          type: "purchase",
          targetEmail: sellerEmail,
          fromEmail: buyerEmail,
          title: "Service booked! 🎉",
          message: `${name.trim()} just paid for "${listingTitle}" ($${amount}). Check your sales page to begin.`,
          listingId,
          listingTitle,
          listingImage: listingImage || "",
          total,
        });
      }

      setPurchaseId(resultPurchaseId);
      setStep("success");
      playSuccess();
    } catch (e) {
      console.error("Payment record failed:", e);
      setStep("form");
    }
  }

  const imageSrc = listingImage || "";

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in-backdrop"
      onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 0.25s ease-out" }}>
        {step === "success" ? (
          <div className="flex flex-col px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <AnimatedCheckmark />
            </div>
            <h2 className="mt-4 text-lg font-black text-white">Payment Successful</h2>
            {purchaseId && <p className="mt-1 text-xs text-zinc-500">Order #{purchaseId.slice(-6).toUpperCase()}</p>}
            <div className="mt-4 rounded-lg bg-zinc-900/40 px-4 py-3 text-left text-xs">
              <div className="flex items-center justify-between text-zinc-400"><span>Service</span><span>${amount.toFixed(2)}</span></div>
              <div className="mt-1 flex items-center justify-between text-zinc-400"><span>Buyer Protection</span><span>$1.00</span></div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-white"><span>Total</span><span>${total.toFixed(2)}</span></div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1 text-xs text-zinc-400">
              <span className="text-emerald-400">✓</span>
              <span>Seller has been notified</span>
            </div>
            <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2 text-left text-[10px] leading-relaxed text-emerald-400/80">
              💳 Secured by Stripe
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">You have 7 days to report an issue after the seller marks this as delivered.</p>
            <button onClick={() => onSuccess(purchaseId)}
              className="mt-5 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white transition hover:bg-sky-400">
              Back to Messages
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-bold text-white">
                {step === "card" ? "Enter Card Details" : "Complete Payment"}
              </h2>
              <button onClick={onClose} className="p-2 text-zinc-400 transition hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3 border-b border-zinc-800/50 px-4 py-3">
              {imageSrc && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                  <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{listingTitle}</p>
                <p className="text-xs text-zinc-400">${amount}</p>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4">
              {step === "form" && (
                <>
                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-zinc-400">Your name</label>
                    <input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-sky-500/40" />
                  </div>

                  <div className="rounded-lg bg-zinc-900/40 px-3.5 py-3 text-xs">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Service</span>
                      <span>${amount.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-zinc-400">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-white">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  {intentError && (
                    <div className="rounded-lg border border-red-800/40 bg-red-900/20 p-3 text-xs text-red-400">
                      {intentError}
                    </div>
                  )}
                </>
              )}

              {step === "card" && clientSecret && (
                <div>
                  <div className="rounded-lg bg-zinc-900/40 px-3.5 py-3 mb-4 text-xs">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>Service</span>
                      <span>${amount.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-zinc-400">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-white">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <PaymentForm total={total} listingId={listingId} title={listingTitle} buyerEmail={buyerEmail} sellerEmail={sellerEmail} onSuccess={handlePaymentSuccess} onBack={() => setStep("form")} />
                  </Elements>
                </div>
              )}
            </div>

            {step === "form" && (
              <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3 flex gap-2">
                <button onClick={onClose}
                  className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-400 transition hover:border-zinc-600 hover:text-white">
                  Cancel
                </button>
                <button onClick={handleContinue} disabled={!isValid}
                  className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
                  Continue — ${total.toFixed(2)}
                </button>
              </div>
            )}

            {step === "processing" && (
              <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-400">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Finalizing...
                </div>
              </div>
            )}
          </>
        )}

        <style jsx>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}
