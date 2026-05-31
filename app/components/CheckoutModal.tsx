"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import stripePromise from "../lib/stripe-client";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { ref, getDownloadURL } from "firebase/storage";
import { createNotification } from "../lib/notifications";
import { showToast } from "./Toast";
import { safeGetDoc } from "../lib/firestore";
import AnimatedCheckmark from "./AnimatedCheckmark";
import { playConfetti, playSuccess } from "../lib/sounds";

interface ListingData {
  id?: string;
  title: string;
  price: string;
  images?: string[];
  imageUrl?: string;
  image?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupArea?: string;
  shippingFee?: number | null;
  freeShipping?: boolean;
  stockQuantity?: number;
  badgeForSale?: string;
  type?: string;
  digitalFileURL?: string;
  digitalFileName?: string;
  digitalStoragePath?: string;
  rentalDays?: number;
  pickupDate?: string;
  returnDate?: string;
  rentalDeposit?: number;
  rentalPriceWeekly?: number;
  rentalPriceMonthly?: number;
  eventDate?: string;
  venue?: string;
  ticketQuantity?: number;
  condition?: string;
  location?: string;
  shipsWithinDays?: number;
  saleType?: string;
  startingBid?: number;
  currentBid?: number;
  auctionEndsAt?: any;
  serviceDuration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  propertyType?: string;
  bedrooms?: number;
}

interface CheckoutModalProps {
  listing: ListingData;
  buyerEmail: string;
  onClose: () => void;
  collectionName?: string;
  winningBid?: number;
}

type DeliveryMethod = "pickup" | "shipping" | "badge" | "digital" | "rental" | "event" | null;
type Step = "form" | "card" | "processing" | "share_address" | "success";

function PaymentForm({ total, listingId, title, price, buyerEmail, onSuccess, onBack, badgeForSale, sellerEmail, collectionName, type, digitalFileURL, digitalFileName, digitalStoragePath }: {
  total: number; listingId: string; title: string; price: string; buyerEmail: string; onSuccess: () => void; onBack: () => void; badgeForSale?: string; sellerEmail?: string; collectionName?: string; type?: string; digitalFileURL?: string; digitalFileName?: string; digitalStoragePath?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [elementReady, setElementReady] = useState(false);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!elements.getElement("payment")) {
      setError("Payment form is still loading. Please wait...");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError("");

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?listingId=${encodeURIComponent(listingId)}&title=${encodeURIComponent(title)}&price=${encodeURIComponent(price)}&buyerEmail=${encodeURIComponent(buyerEmail)}&sellerEmail=${encodeURIComponent(sellerEmail || "")}&collectionName=${encodeURIComponent(collectionName || "listings")}${badgeForSale ? `&badgeForSale=${encodeURIComponent(badgeForSale)}` : ""}${type === "digital" ? `&type=digital&digitalStoragePath=${encodeURIComponent(digitalStoragePath || digitalFileURL || "")}&digitalFileName=${encodeURIComponent(digitalFileName || "")}` : ""}${type === "rental" ? `&type=rental` : ""}`,
      },
      redirect: "if_required",
    });

    setSubmitting(false);
    if (submitError) {
      setError("Payment failed. Please try another payment method or try again.");
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-3">
      <PaymentElement onReady={() => setElementReady(true)} />
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--muted)]">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Payments protected by <span className="font-semibold tracking-tight">Stripe</span>
      </div>
      {error && (
        <div className="rounded-lg border border-red-800/40 bg-red-900/20 p-3 text-xs text-red-400">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !elementReady || submitting}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
      >
        {submitting ? "Processing..." : `Pay $${total.toFixed(2)}`}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-bold text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]"
      >
        Cancel
      </button>
    </form>
  );
}

export default function CheckoutModal({ listing, buyerEmail, onClose, collectionName = "listings", winningBid }: CheckoutModalProps) {
  const router = useRouter();
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
    if (winningBid) return "pickup";
    if (listing.type === "digital") return "digital";
    if (listing.type === "rental") return "rental";
    if (listing.type === "event") return "event";
    if (listing.badgeForSale) return "badge";
    if (listing.pickupAvailable && !listing.shippingAvailable) return "pickup";
    if (listing.shippingAvailable && !listing.pickupAvailable) return "shipping";
    return null;
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [intentError, setIntentError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const shippingAmount = listing.shippingFee && !listing.freeShipping ? listing.shippingFee : 0;
  const itemPrice = winningBid || Number(listing.price) || 0;
  const processingFee = 1.00;
  const isBadge = deliveryMethod === "badge";
  const isDigital = deliveryMethod === "digital";
  const isRental = deliveryMethod === "rental";
  const isEvent = deliveryMethod === "event";
  const isAuction = !!winningBid;
  const rentalDepositAmount = isRental ? Number(listing.rentalDeposit) || 0 : 0;
  const rentalItemTotal = isRental ? itemPrice * (listing.rentalDays || 1) : itemPrice;
  const total = isAuction ? winningBid! + processingFee : isBadge || isDigital || isRental || isEvent ? rentalItemTotal + processingFee + rentalDepositAmount : (deliveryMethod === "shipping" ? itemPrice + shippingAmount : itemPrice) + processingFee;

  const isValid = isBadge || isDigital || isRental || isEvent ? name.trim() : name.trim() && phone.trim() && (deliveryMethod !== "shipping" || address.trim()) && deliveryMethod;

  // Restore body scroll on unmount
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ESC key closes modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") safeClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // If user logs out during checkout, close modal
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        showToast("Session expired. Please sign in again.", "error");
        safeClose();
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (step === "success") {
      playSuccess();
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Auto-fill saved info + shipping address from profile
  useEffect(() => {
    (async () => {
      try {
        // Load from localStorage checkout history
        const saved = localStorage.getItem("checkoutInfo");
        if (saved) {
          const info = JSON.parse(saved);
          if (info.name) setName(info.name);
          if (info.phone) setPhone(info.phone);
        }
        // Load saved shipping address from Firestore profile
        if (buyerEmail) {
          const snap = await getDocs(query(collection(db, "profiles"), where("email", "==", buyerEmail)));
          if (!snap.empty) {
            const data = snap.docs[0].data();
            if (data.shippingName && !name) setName(data.shippingName);
            if (data.shippingPhone && !phone) setPhone(data.shippingPhone);
            const parts = [data.shippingAddress, data.shippingCity, data.shippingPostcode, data.shippingCountry].filter(Boolean);
            if (parts.length > 0 && !address) setAddress(parts.join(", "));
          }
        }
      } catch {}
    })();
  }, [buyerEmail]);

  function safeClose() {
    document.body.style.overflow = "";
    onClose();
  }

  function resetToForm() {
    setStep("form");
    setClientSecret("");
    setIntentError("");
  }

  async function handleContinue() {
    if (!isValid || step !== "form") return;
    if (listing.stockQuantity != null && listing.stockQuantity <= 0) {
      showToast("This item is out of stock.", "error");
      setStep("form");
      return;
    }
    setStep("card");
    setIntentError("");

    try {
      // Verify the real price from Firestore
      const snap = await safeGetDoc(doc(db, collectionName, listing.id));
      if (!snap) {
        setIntentError("Could not verify listing. Please try again.");
        setStep("form");
        return;
      }
      if (!snap.exists()) {
        setIntentError("Listing not found.");
        setStep("form");
        return;
      }
      const snapData = snap.data();
      if (snapData.status === "sold") {
        setIntentError("This listing has already sold.");
        setStep("form");
        return;
      }
      if (snapData.expiresAt?.toMillis?.() < Date.now()) {
        setIntentError("This listing has expired.");
        setStep("form");
        return;
      }
      if (snapData.stockQuantity != null && snapData.stockQuantity <= 0) {
        setIntentError("This item is out of stock.");
        setStep("form");
        return;
      }
      if (winningBid) {
        const currentBid = Number(snapData.currentBid);
        if (Math.round(currentBid * 100) !== Math.round(winningBid * 100)) {
          setIntentError("The winning bid amount has changed. Please refresh and try again.");
          setStep("form");
          return;
        }
        if (snapData.highestBidder !== buyerEmail) {
          setIntentError("You are no longer the highest bidder.");
          setStep("form");
          return;
        }
      }
      const realPrice = winningBid || Number(snapData.price);
      const realShipping = snapData.shippingFee && !snapData.freeShipping ? Number(snapData.shippingFee) : 0;
      const realRentalDays = snapData.rentalDays ?? listing.rentalDays ?? 1;
      const realRentalTotal = realPrice * Number(realRentalDays);
      const realDeposit = deliveryMethod === "rental" ? Number(snapData.rentalDeposit) || 0 : 0;
      const realTotal = (deliveryMethod === "badge"
        ? realPrice
        : deliveryMethod === "rental"
          ? realRentalTotal + realDeposit
          : deliveryMethod === "shipping"
            ? realPrice + realShipping
            : realPrice) + 1.00;

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          title: listing.title,
          price: String(realTotal),
          listingId: listing.id,
          imageUrl: listing.images?.[0] || listing.imageUrl || listing.image || "",
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
    } catch (e: any) {
      setIntentError("Could not connect to payment server. Please try again.");
      setStep("form");
    }
  }

  async function handlePaymentSuccess() {
    setStep("processing");
    try {
      const token = await auth.currentUser?.getIdToken();

      let resolvedDigitalURL = "";
      if (isDigital) {
        try {
          resolvedDigitalURL = listing.digitalStoragePath
            ? await getDownloadURL(ref(storage, listing.digitalStoragePath))
            : listing.digitalFileURL || "";
        } catch (e) {
          console.error("Failed to resolve digital URL:", e);
        }
      }

      const createRes = await fetch("/api/create-purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
          sellerEmail: listing.sellerEmail,
          buyerName: name.trim(),
          buyerPhone: isAuction || isBadge || isDigital || isRental || isEvent ? "" : phone.trim(),
          deliveryMethod: isAuction ? "pickup" : isBadge ? "badge" : isDigital ? "digital" : isRental ? "rental" : isEvent ? "event" : deliveryMethod,
          shippingAddress: deliveryMethod === "shipping" ? address.trim() : "",
          shippingFee: deliveryMethod === "shipping" ? shippingAmount : 0,
          processingFee: 1.00,
          total,
          badgeTransfer: isBadge ? listing.badgeForSale : "",
          type: isAuction ? "auction" : isDigital ? "digital" : isRental ? "rental" : isEvent ? "event" : "physical",
          digitalFileURL: resolvedDigitalURL,
          digitalFileName: isDigital ? listing.digitalFileName : "",
          status: isDigital ? "delivered" : isRental ? "rented" : "pending",
          rentalStart: isRental && listing.pickupDate ? new Date(listing.pickupDate).toISOString() : null,
          rentalEnd: isRental && listing.returnDate ? new Date(listing.returnDate).toISOString() : null,
          rentalDays: isRental ? (listing.rentalDays || 1) : null,
          stripePaymentIntentId: paymentIntentId || "",
          winningBid: winningBid || null,
          collectionName,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error("Purchase creation failed:", createData.error);
        setStep("share_address");
        return;
      }

      const purchaseId = createData.purchaseId;

      // Auto-transfer badge if applicable
      if (isBadge && listing.badgeForSale) {
        try {
          const sellerSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", listing.sellerEmail)));
          const buyerSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", buyerEmail)));
          const sellerId = sellerSnap.docs[0]?.id;
          const buyerId = buyerSnap.docs[0]?.id;
          if (sellerId && buyerId) {
            const { autoTransferBadge } = await import("../lib/xpValidation");
            await autoTransferBadge(sellerId, buyerId, listing.badgeForSale, purchaseId!, listing.sellerEmail);
          }
        } catch (e) {
          console.error("Auto badge transfer failed:", e);
        }
      }

      await createNotification({
        type: isAuction ? "purchase" : "purchase",
        targetEmail: listing.sellerEmail,
        fromEmail: buyerEmail,
        title: isAuction ? "Auction payment received! 🎉" : isDigital ? "Your digital item was purchased! 🎉" : isBadge ? "Your badge was purchased! 🎉" : isRental ? "Your item was rented! 🎉" : isEvent ? "Your event tickets were purchased! 🎉" : "Your item sold! 🎉",
        message: isAuction
          ? `${name.trim()} won the auction and paid $${winningBid}. Coordinate delivery through messages.`
          : isDigital
          ? `${name.trim()} just purchased "${listing.title}" (digital download).`
          : isBadge
          ? `${name.trim()} just purchased your "${listing.badgeForSale}" badge. It has been automatically transferred.`
          : isRental
          ? `${name.trim()} just rented "${listing.title}" for ${listing.rentalDays || 1} day(s) — $${listing.price}/day. Coordinate pickup.`
          : isEvent
          ? `${name.trim()} just purchased tickets to "${listing.title}" for $${listing.price}. Coordinate with the buyer.`
          : `${name.trim()} just purchased "${listing.title}" for $${listing.price}. Check your sales page to confirm and ship.`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
        total,
        buyerName: name.trim(),
        orderId: purchaseId,
      });

      // Buyer purchase confirmation
      await createNotification({
        type: isAuction ? "auction_won" : "purchase_confirmation",
        targetEmail: buyerEmail,
        fromEmail: listing.sellerEmail || "",
        title: isAuction ? "Auction Won — Payment Successful 🎉" : isDigital ? "Digital Purchase Confirmed 📥" : "Purchase Confirmed 🛒",
        message: isAuction
          ? `You won the auction for "${listing.title}" and your payment of $${winningBid} was successful.\n\nCoordinate delivery with the seller through messages.`
          : isDigital
          ? `Your purchase of "${listing.title}" is complete. The digital file is ready for download.`
          : isRental
          ? `Your rental of "${listing.title}" has been confirmed.\n\nRental period: ${listing.rentalDays || 1} day(s)\nRate: $${listing.price}/day`
          : isEvent
          ? `Your ticket purchase for "${listing.title}" has been confirmed.\n\nAmount: $${listing.price}`
          : `Your purchase of "${listing.title}" has been confirmed.\n\nAmount: $${listing.price}`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: listing.images?.[0] || listing.imageUrl || listing.image || "",
        total,
        sellerName: listing.sellerUsername || listing.sellerEmail?.split("@")[0] || "",
        orderId: purchaseId,
      });

      setOrderId(purchaseId);
      try {
        localStorage.setItem("checkoutInfo", JSON.stringify({ name: name.trim(), phone: phone.trim() }));
      } catch {}

          setStep(isBadge || isDigital || isRental || isEvent ? "success" : "share_address");
    } catch (e) {
      console.error("Purchase record failed:", e);
      setStep("share_address");
    }
  }

  async function handleSendAddress() {
    const shippingMsg = deliveryMethod === "shipping"
      ? `Hi, please ship to:\n\n${address.trim()}\n\n${phone.trim() ? `Contact: ${phone.trim()}\n\n` : ""}Thanks!`
      : "Hi, I'd like to arrange pickup for this item. Thanks!";

    await addDoc(collection(db, "messages"), {
      type: "text",
      text: shippingMsg,
      sender: buyerEmail,
      receiver: listing.sellerEmail,
      participants: [buyerEmail, listing.sellerEmail],
      listingId: listing.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    setStep("success");
  }

  const imageSrc = listing.images?.[0] || listing.imageUrl || listing.image || "";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={safeClose}
    >
      <div
        ref={modalRef}
        className={`w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden transition-all duration-300 ${
          step === "success" || step === "share_address" ? "max-w-sm" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 0.25s ease-out" }}
      >
        {step === "share_address" ? (
          <div className="flex flex-col px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20">
              <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2H4a2 2 0 00-2 2v4m0 0v8a2 2 0 002 2h4m0 0h4m0 0h4a2 2 0 002-2V10m0 0V4a2 2 0 00-2-2h-4m-4 0v4m0 0h4" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Payment Successful</h2>
            {orderId && <p className="mt-1 text-xs text-[var(--muted)]">Order #{orderId.slice(-6).toUpperCase()}</p>}

            <div className="mt-4 text-left">
              <p className="mb-2 text-xs text-[var(--muted)]">
                {isBadge
                  ? "Badge transferred to your account automatically!"
                  : isDigital
                  ? "Digital item delivered! Check your Purchases page to download."
                  : isRental
                  ? "Rental confirmed! Coordinate pickup with the seller in messages."
                  : isEvent
                  ? "Tickets purchased! Your tickets will be ready at the venue. Check your Purchases page for details."
                  : deliveryMethod === "shipping"
                    ? "Share your shipping address with the seller?"
                    : "Let the seller know you'd like to arrange pickup?"}
              </p>
              <div className="rounded-lg bg-zinc-900/60 px-4 py-3 text-xs space-y-1">
                <p className="font-bold text-[var(--foreground)]">{name.trim()}</p>
                {phone.trim() && <p className="text-[var(--muted)]">📞 {phone.trim()}</p>}
                {!isBadge && deliveryMethod === "shipping" && address.trim() && (
                  <p className="text-[var(--muted)]">📍 {address.trim()}</p>
                )}
                {!isBadge && deliveryMethod === "shipping" && (
                  <p className="pt-1 text-[10px] text-[var(--muted)]">Only shared if you send below.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setStep("success")}
                className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-zinc-800"
              >
                {isBadge ? "Done" : "Skip"}
              </button>
              {!isBadge && (
                <button
                  onClick={handleSendAddress}
                  className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                >
                  {deliveryMethod === "shipping" ? "Send Address" : "Send Message"}
                </button>
              )}
            </div>
          </div>
        ) : step === "success" ? (
          <div className="flex flex-col px-6 py-8 text-center relative overflow-hidden">
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <AnimatedCheckmark />
            </div>
            <h2 className="mt-4 text-lg font-black text-[var(--foreground)]">Payment Successful</h2>
            {orderId && <p className="mt-1 text-xs text-[var(--muted)]">Order #{orderId.slice(-6).toUpperCase()}</p>}
            <div className="mt-4 rounded-lg bg-zinc-900/40 px-4 py-3 text-left text-xs">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                <span>${rentalItemTotal.toFixed(2)}</span>
              </div>
              {deliveryMethod === "shipping" && shippingAmount > 0 && (
                <div className="mt-1 flex items-center justify-between text-[var(--muted)]"><span>Shipping</span><span>${shippingAmount.toFixed(2)}</span></div>
              )}
              {isRental && listing.rentalDeposit && (
                <div className="mt-1 flex items-center justify-between text-amber-400">
                  <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 Refundable Deposit</span>
                  <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-[var(--muted)]"><span>Buyer Protection</span><span>$1.00</span></div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-[var(--foreground)]"><span>Total Due Today</span><span>${total.toFixed(2)}</span></div>
              {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-amber-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
            </div>
            <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2 text-left text-[10px] leading-relaxed text-amber-400/80">
              🔒 Your payment is held securely in escrow. Funds are released to the seller only after you confirm delivery.
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 text-xs text-[var(--muted)]">
              <span className="text-emerald-400">✓</span>
              <span>Seller has been notified</span>
            </div>
            <button
              onClick={() => router.push(`/messages?user=${encodeURIComponent(listing.sellerEmail || "")}&listing=${listing.id}&purchased=1`)}
              className="mt-5 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400"
            >
              View Conversation
            </button>
            <button
              onClick={safeClose}
              className="mt-2 w-full rounded-xl border border-zinc-700 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {step === "card" ? "Enter Card Details" : "Complete Purchase"}
              </h2>
              <button onClick={safeClose} className="p-2 text-[var(--muted)] transition hover:text-[var(--foreground)]">
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
                <p className="truncate text-sm font-bold text-[var(--foreground)]">{listing.title}</p>
                <p className="text-xs text-[var(--muted)]">${listing.price}</p>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto px-4 py-4 max-h-[60vh]">
              {step === "form" && (
                <>
                  {!isBadge && (listing.pickupAvailable && listing.shippingAvailable) && (
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">Delivery</label>
                      <div className="space-y-1.5">
                        {listing.pickupAvailable && (
                          <button
                            onClick={() => setDeliveryMethod("pickup")}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition ${
                              deliveryMethod === "pickup"
                                ? "border-sky-500/40 bg-sky-500/10 text-[var(--foreground)]"
                                : "border-zinc-800 bg-zinc-900/60 text-[var(--muted)] hover:border-zinc-700"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              deliveryMethod === "pickup" ? "border-sky-500 bg-sky-500" : "border-zinc-600"
                            }`}>
                              {deliveryMethod === "pickup" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <span>📍 Pickup{listing.pickupArea ? ` — ${listing.pickupArea}` : ""}</span>
                          </button>
                        )}
                        {listing.shippingAvailable && (
                          <button
                            onClick={() => setDeliveryMethod("shipping")}
                            className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition ${
                              deliveryMethod === "shipping"
                                ? "border-sky-500/40 bg-sky-500/10 text-[var(--foreground)]"
                                : "border-zinc-800 bg-zinc-900/60 text-[var(--muted)] hover:border-zinc-700"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              deliveryMethod === "shipping" ? "border-sky-500 bg-sky-500" : "border-zinc-600"
                            }`}>
                              {deliveryMethod === "shipping" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <span>{listing.freeShipping ? "Free shipping" : listing.shippingFee ? `Shipping — $${listing.shippingFee}` : "Shipping"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{isBadge ? "Your name" : "Your details"}</label>
                    <div className="space-y-2">
                      <input type="text" placeholder={isBadge ? "Full name" : "Full name"} value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                      {!isBadge && (
                        <input type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                      )}
                      {deliveryMethod === "shipping" && (
                        <input type="text" placeholder="Shipping address" value={address} onChange={(e) => setAddress(e.target.value)}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/40" />
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-zinc-900/40 px-3.5 py-3 text-xs">
                    <div className="flex items-center justify-between text-[var(--muted)]">
                      <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                      <span>${rentalItemTotal.toFixed(2)}</span>
                    </div>
                    {deliveryMethod === "shipping" && shippingAmount > 0 && (
                      <div className="mt-1 flex items-center justify-between text-[var(--muted)]">
                        <span>Shipping</span>
                        <span>${shippingAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {isRental && listing.rentalDeposit && (
                      <div className="mt-1 flex items-center justify-between text-amber-400">
                        <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 Refundable Deposit</span>
                        <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[var(--muted)]">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-[var(--foreground)]">
                      <span>Total Due Today</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-amber-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
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
                    <div className="flex items-center justify-between text-[var(--muted)]">
                      <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                      <span>${rentalItemTotal.toFixed(2)}</span>
                    </div>
                    {deliveryMethod === "shipping" && shippingAmount > 0 && (
                      <div className="mt-1 flex items-center justify-between text-[var(--muted)]">
                        <span>Shipping</span>
                        <span>${shippingAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {isRental && listing.rentalDeposit && (
                      <div className="mt-1 flex items-center justify-between text-amber-400">
                        <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]">🔒 Refundable Deposit</span>
                        <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[var(--muted)]">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2 text-sm font-bold text-[var(--foreground)]">
                      <span>Total Due Today</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-amber-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
                  </div>
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <PaymentForm total={total} listingId={listing.id} title={listing.title} price={String(total)} buyerEmail={buyerEmail} onSuccess={handlePaymentSuccess} onBack={resetToForm} badgeForSale={listing.badgeForSale} sellerEmail={listing.sellerEmail} collectionName={collectionName} type={listing.type} digitalFileURL={listing.digitalFileURL} digitalFileName={listing.digitalFileName} digitalStoragePath={listing.digitalStoragePath} />
                  </Elements>
                </div>
              )}
            </div>

            {step === "form" && (
              <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3 flex gap-2">
                <button
                  onClick={safeClose}
                  className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!isValid}
                  className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
                >
                  Continue — ${total.toFixed(2)}
                </button>
              </div>
            )}

            {step === "processing" && (
              <div className="sticky bottom-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-[var(--muted)]">
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
