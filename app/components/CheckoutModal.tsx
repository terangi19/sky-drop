"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import stripePromise from "../lib/stripe-client";
import { auth, db, storage, onAuthStateChanged } from "../lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFreshIdToken } from "../lib/api-auth";
import { ref, getDownloadURL } from "firebase/storage";
import { createNotification } from "../lib/notifications";
import { showToast } from "./Toast";

import AnimatedCheckmark from "./AnimatedCheckmark";
import { playConfetti, playSuccess } from "../lib/sounds";
import { isListingAvailableForPurchase } from "../lib/listing-availability";

interface ListingData {
  id?: string;
  status?: string;
  expiresAt?: unknown;
  highestBidder?: string;
  title: string;
  price: string;
  images?: string[];
  imageUrl?: string;
  image?: string;
  sellerEmail?: string;
  sellerUsername?: string;
  sellerId?: string;
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
type Step = "form" | "card" | "processing" | "share_address" | "success" | "error";

interface ProgressStep {
  key: string;
  label: string;
  icon: string;
}

const CHECKOUT_STEPS: ProgressStep[] = [
  { key: "form", label: "Details", icon: "📝" },
  { key: "card", label: "Payment", icon: "💳" },
  { key: "processing", label: "Confirm", icon: "⏳" },
  { key: "success", label: "Complete", icon: "✅" },
];

function PaymentForm({ total, listingId, title, price, buyerEmail, paymentIntentId, onSuccess, onBack, badgeForSale, sellerEmail, collectionName, type, digitalFileURL, digitalFileName, digitalStoragePath }: {
  total: number; listingId: string; title: string; price: string; buyerEmail: string; paymentIntentId: string; onSuccess: (confirmedPaymentIntentId: string) => void; onBack: () => void; badgeForSale?: string; sellerEmail?: string; collectionName?: string; type?: string; digitalFileURL?: string; digitalFileName?: string; digitalStoragePath?: string;
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

    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?listingId=${encodeURIComponent(listingId)}&title=${encodeURIComponent(title)}&price=${encodeURIComponent(price)}&buyerEmail=${encodeURIComponent(buyerEmail)}&sellerEmail=${encodeURIComponent(sellerEmail || "")}&collectionName=${encodeURIComponent(collectionName || "listings")}${badgeForSale ? `&badgeForSale=${encodeURIComponent(badgeForSale)}` : ""}${type === "digital" ? `&type=digital&digitalStoragePath=${encodeURIComponent(digitalStoragePath || digitalFileURL || "")}&digitalFileName=${encodeURIComponent(digitalFileName || "")}` : ""}${type === "rental" ? `&type=rental` : ""}`,
      },
      redirect: "if_required",
    });

    setSubmitting(false);
    if (submitError) {
      const errorMessage = submitError.message || "Payment failed";
      if (errorMessage.includes("card")) {
        setError("Your card was declined. Please try a different payment method or check your card details.");
      } else if (errorMessage.includes("insufficient funds")) {
        setError("Insufficient funds. Please try a different payment method.");
      } else if (errorMessage.includes("expired")) {
        setError("Your card has expired. Please use a different payment method.");
      } else {
        setError("Payment failed. Please try again or contact support if the issue persists.");
      }
      return;
    }

    const confirmedId = paymentIntent?.id || paymentIntentId;
    if (!confirmedId) {
      setError("Payment went through but the order reference was lost. Tap Retry on the next screen.");
      return;
    }
    onSuccess(confirmedId);
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div className="relative">
        <PaymentElement onReady={() => setElementReady(true)} />
        {!elementReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl animate-pulse">
            <div className="flex items-center gap-2 text-white">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs">Loading payment form...</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-white">
        <svg className="h-3.5 w-3.5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Payments protected by <span className="font-semibold tracking-tight">Stripe</span>
      </div>
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-2">
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || !elementReady || submitting}
        className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg disabled:hover:shadow-sky-500/20 disabled:hover:brightness-100 disabled:active:scale-100"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Processing...
          </span>
        ) : `Pay $${total.toFixed(2)}`}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-bold text-[var(--muted)] transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-[var(--foreground)] active:scale-[0.97]"
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
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("New Zealand");
  const [step, setStep] = useState<Step>("form");
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const [intentError, setIntentError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [sellerRating, setSellerRating] = useState<number | null>(null);
  const [sellerResponseTime, setSellerResponseTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const shippingDetailsComplete =
    address.trim().length > 0 && city.trim().length > 0 && postcode.trim().length > 0;
  const isValid = isBadge || isDigital || isRental || isEvent
    ? name.trim()
    : name.trim() && phone.trim() && deliveryMethod && (deliveryMethod !== "shipping" || shippingDetailsComplete);

  function formatShippingAddress() {
    const parts = [address.trim(), `${city.trim()} ${postcode.trim()}`.trim(), country.trim()].filter(Boolean);
    return parts.join(", ");
  }

  function getCurrentStepIndex(): number {
    const stepIndexMap: Record<Step, number> = { form: 0, card: 1, processing: 2, share_address: 2, success: 3, error: 2 };
    return stepIndexMap[step] || 0;
  }

  function getEstimatedDelivery(): string {
    if (deliveryMethod === "pickup") return "Available for pickup";
    if (deliveryMethod === "digital") return "Instant delivery";
    if (deliveryMethod === "shipping") {
      const days = listing.shipsWithinDays || 3;
      return `Estimated delivery: ${days} business days`;
    }
    return "Delivery details confirmed";
  }

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

  // Auto-fill from last checkout or saved profile shipping fields & load seller info
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem("checkoutInfo");
        if (saved) {
          const info = JSON.parse(saved);
          if (info.name) setName(info.name);
          if (info.phone) setPhone(info.phone);
          if (info.address) setAddress(info.address);
          if (info.city) setCity(info.city);
          if (info.postcode) setPostcode(info.postcode);
          if (info.country) setCountry(info.country);
        }
      } catch {}

      const user = auth.currentUser;
      if (!user || cancelled) return;
      try {
        const snap = await getDoc(doc(db, "profiles", user.uid));
        if (!snap.exists() || cancelled) return;
        const d = snap.data();
        setName((prev) => prev || d.shippingName || "");
        setPhone((prev) => prev || d.shippingPhone || "");
        setAddress((prev) => prev || d.shippingAddress || "");
        setCity((prev) => prev || d.shippingCity || "");
        setPostcode((prev) => prev || d.shippingPostcode || "");
        setCountry((prev) => (prev && prev !== "New Zealand" ? prev : d.shippingCountry || "New Zealand"));
      } catch (e) {
        console.error("Failed to load profile shipping info:", e);
      }

      // Load seller trust info — profiles are keyed by UID (sellerId)
      if (listing.sellerId && !cancelled) {
        try {
          const sellerQuery = await getDoc(doc(db, "profiles", listing.sellerId));
          if (sellerQuery.exists()) {
            const sellerData = sellerQuery.data();
            setSellerRating(sellerData.sellerRating || null);
            setSellerResponseTime(sellerData.averageResponseTime || null);
          }
        } catch (e) {
          console.error("Failed to load seller info:", e);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [listing.sellerEmail]);

  function safeClose() {
    document.body.style.overflow = "";
    onClose();
  }

  function resetToForm() {
    setStep("form");
    setClientSecret("");
    setIntentError("");
  }

  function listingTimestampMs(value: unknown): number | null {
    if (!value) return null;
    if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
      return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof (value as { seconds?: number }).seconds === "number") {
      return (value as { seconds: number }).seconds * 1000;
    }
    const t = new Date(value as string | number).getTime();
    return Number.isFinite(t) ? t : null;
  }

  async function handleContinue() {
    if (!isValid || step !== "form" || submitting) return;
    setSubmitting(true);
    if (listing.stockQuantity != null && listing.stockQuantity <= 0) {
      showToast("This item is out of stock.", "error");
      setSubmitting(false);
      return;
    }
    setStep("card");
    setIntentError("");

    try {
      const user = auth.currentUser;
      if (!user) {
        setIntentError("You must be signed in.");
        setStep("form");
        return;
      }

      if (!listing.id) {
        throw new Error("Listing not found.");
      }
      if (!isListingAvailableForPurchase(listing)) {
        throw new Error("This listing is no longer available.");
      }
      const expiresMs = listingTimestampMs(listing.expiresAt);
      if (expiresMs != null && expiresMs < Date.now()) {
        throw new Error("This listing has expired.");
      }
      if (listing.stockQuantity != null && listing.stockQuantity <= 0) {
        throw new Error("This item is out of stock.");
      }
      if (winningBid) {
        if (Math.round(Number(listing.currentBid) * 100) !== Math.round(winningBid * 100)) {
          throw new Error("The winning bid amount has changed. Please refresh and try again.");
        }
        if (listing.highestBidder !== buyerEmail) {
          throw new Error("You are no longer the highest bidder.");
        }
      }

      const realPrice = winningBid || Number(listing.price);
      const realShipping = listing.shippingFee && !listing.freeShipping ? Number(listing.shippingFee) : 0;
      const realRentalDays = listing.rentalDays ?? 1;
      const realDeposit = deliveryMethod === "rental" ? Number(listing.rentalDeposit) || 0 : 0;
      const realRentalTotal = realPrice * Number(realRentalDays);
      const realTotal = (deliveryMethod === "badge"
        ? realPrice
        : deliveryMethod === "rental"
          ? realRentalTotal + realDeposit
          : deliveryMethod === "shipping"
            ? realPrice + realShipping
            : realPrice) + 1.00;

      const token = await getFreshIdToken();
      if (!token) {
        setIntentError("Please sign in again to continue.");
        setStep("form");
        return;
      }
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: listing.title,
          price: String(realTotal),
          listingId: listing.id,
          imageUrl: listing.images?.[0] || listing.imageUrl || listing.image || "",
          collectionName,
          deliveryMethod,
          winningBid: winningBid || null,
          shippingFee: deliveryMethod === "shipping" ? realShipping : 0,
        }),
      });
      let data: any;
      try { data = await res.json(); } catch { data = {}; }
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId || "");
      } else {
        const apiErr = data.error || `Could not start checkout (${res.status})`;
        setIntentError(apiErr);
        setStep("form");
      }
    } catch (e: unknown) {
      console.error("[CheckoutModal] create-payment-intent error:", e);
      const err = e as { code?: string; message?: string };
      const msg = err?.message || "";
      const txErrors = ["already sold", "expired", "out of stock", "Someone else", "not found", "bid amount", "highest bidder"];
      if (err?.code === "permission-denied" || msg.includes("insufficient permissions")) {
        setIntentError("Checkout could not start. Please refresh the page and try again.");
      } else if (txErrors.some((t) => msg.includes(t))) {
        setIntentError(msg);
      } else {
        setIntentError(msg || "Could not connect to payment server. Please try again.");
      }
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaymentSuccess(confirmedPaymentIntentId?: string) {
    setStep("processing");
    const piId = confirmedPaymentIntentId || paymentIntentId;
    if (confirmedPaymentIntentId) {
      setPaymentIntentId(confirmedPaymentIntentId);
    }
    try {
      if (!piId) {
        setPurchaseError(
          "Missing payment reference. Tap Retry — your card may already have been charged."
        );
        setStep("error");
        return;
      }

      const token = await getFreshIdToken();

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
          shippingAddress: deliveryMethod === "shipping" ? formatShippingAddress() : "",
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
          stripePaymentIntentId: piId,
          winningBid: winningBid || null,
          collectionName,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        const errMsg = createData.error || "Purchase creation failed. Your payment was received but we couldn't create the purchase record.";
        console.error("Purchase creation failed:", createData.error);
        showToast("Payment received! But purchase setup failed. Please retry.", "error");
        setPurchaseError(errMsg);
        setStep("error");
        return;
      }

      const purchaseId = createData.purchaseId;

      // Badge transfer runs server-side in create-purchase when configured

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
        localStorage.setItem(
          "checkoutInfo",
          JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            address: address.trim(),
            city: city.trim(),
            postcode: postcode.trim(),
            country: country.trim(),
          })
        );
      } catch {}

      if (deliveryMethod === "shipping" && auth.currentUser?.uid) {
        try {
          await setDoc(
            doc(db, "profiles", auth.currentUser.uid),
            {
              shippingName: name.trim(),
              shippingPhone: phone.trim(),
              shippingAddress: address.trim(),
              shippingCity: city.trim(),
              shippingPostcode: postcode.trim(),
              shippingCountry: country.trim(),
            },
            { merge: true }
          );
        } catch (e) {
          console.error("Failed to save shipping info to profile:", e);
        }
      }

          setStep(isBadge || isDigital || isRental || isEvent ? "success" : "share_address");
    } catch (e: any) {
      const errMsg = e?.message || "An unexpected error occurred while creating your purchase. Your payment was received.";
      console.error("Purchase record failed:", e);
      showToast("Payment received! But purchase setup failed. Please retry.", "error");
      setPurchaseError(errMsg);
      setStep("error");
    }
  }

  async function handleRetryPurchase() {
    setPurchaseError("");
    await handlePaymentSuccess(paymentIntentId);
  }

  async function handleSendAddress() {
    const shippingMsg = deliveryMethod === "shipping"
      ? `Hi, please ship to:\n\n${formatShippingAddress()}\n\n${phone.trim() ? `Contact: ${phone.trim()}\n\n` : ""}Thanks!`
      : "Hi, I'd like to arrange pickup for this item. Thanks!";

    try {
      const token = await getFreshIdToken();
      if (token && listing.sellerEmail && listing.id) {
        await fetch("/api/checkout-message", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            text: shippingMsg,
            sellerEmail: listing.sellerEmail,
            listingId: listing.id,
          }),
        });
      }
    } catch (e) {
      console.error("Failed to send checkout message:", e);
    }

    setStep("success");
  }

  const imageSrc = listing.images?.[0] || listing.imageUrl || listing.image || "";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 animate-fade-in-backdrop"
      onClick={safeClose}
    >
      <div
      ref={modalRef}
      className={`relative w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--card-border)] bg-gradient-to-br from-black/95 to-black/90 shadow-2xl shadow-black/40 backdrop-blur-xl max-h-[92vh] overflow-y-auto my-4 sm:my-0 mx-auto animate-fade-in-scale ${
        step === "success" || step === "share_address" || step === "error" ? "max-w-sm" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
        {step === "share_address" ? (
          <div className="relative flex flex-col px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 ring-1 ring-sky-500/30">
              <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2H4a2 2 0 00-2 2v4m0 0v8a2 2 0 002 2h4m0 0h4m0 0h4a2 2 0 002-2V10m0 0V4a2 2 0 00-2-2h-4m-4 0v4m0 0h4" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-white">Payment Successful</h2>
            {orderId && <p className="mt-1 text-xs text-white">Order #{orderId.slice(-6).toUpperCase()}</p>}

            <div className="mt-4 text-left">
              <p className="mb-2 text-xs text-white">
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
              <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] px-4 py-3 text-xs space-y-1">
                <p className="font-bold text-[var(--foreground)]">{name.trim()}</p>
                {phone.trim() && <p className="text-white">📞 {phone.trim()}</p>}
                {!isBadge && deliveryMethod === "shipping" && formatShippingAddress() && (
                  <p className="text-white">📍 {formatShippingAddress()}</p>
                )}
                {!isBadge && deliveryMethod === "shipping" && (
                  <p className="pt-1 text-[10px] text-white">Only shared if you send below.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setStep("success")}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-white/[0.06] hover:border-white/[0.12]"
              >
                {isBadge ? "Done" : "Skip"}
              </button>
              {!isBadge && (
                <button
                  onClick={handleSendAddress}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
                >
                  {deliveryMethod === "shipping" ? "Send Address" : "Send Message"}
                </button>
              )}
            </div>
          </div>
        ) : step === "error" ? (
          <div className="relative flex flex-col px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 ring-1 ring-sky-500/30">
              <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-black text-white">Payment Received</h2>
            <p className="mt-1 text-xs text-white">Your card was charged ${total.toFixed(2)}</p>
            <div className="mt-4 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02] px-4 py-3 text-left text-xs text-sky-400/90">
              <p className="font-semibold text-sky-300">Purchase setup failed</p>
              <p className="mt-1 text-white">{purchaseError}</p>
              <p className="mt-2 text-white">Your payment was successful, but we couldn&apos;t complete the purchase. Please try again — you won&apos;t be charged twice.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={safeClose}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-white/[0.06] hover:border-white/[0.12]"
              >
                Close
              </button>
              <button
                onClick={handleRetryPurchase}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : step === "success" ? (
          <div className="relative flex flex-col px-6 py-8 text-center overflow-hidden">
            {showConfetti && (
              <div className="absolute inset-0 z-50 pointer-events-none">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="absolute h-2 w-2 rounded-full animate-confetti-particle"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      background: ["#0ea5e9", "#38bdf8", "#7dd3fc", "#ffffff", "#bae6fd", "#0284c7"][Math.floor(Math.random() * 6)],
                      animationDelay: `${Math.random() * 0.5}s`,
                      animationDuration: `${0.6 + Math.random() * 0.8}s`,
                    }}
                  />
                ))}
              </div>
            )}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/30 to-sky-500/20 ring-1 ring-sky-500/30">
              <AnimatedCheckmark />
            </div>
            <h2 className="mt-4 text-lg font-black text-white">Payment Successful</h2>
            {orderId && <p className="mt-1 text-xs text-white">Order #{orderId.slice(-6).toUpperCase()}</p>}

            {/* Order Receipt */}
            <div className="mt-4 rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] px-4 py-3 text-left text-xs">
              <div className="flex items-center justify-between text-white">
                <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                <span>${rentalItemTotal.toFixed(2)}</span>
              </div>
              {deliveryMethod === "shipping" && shippingAmount > 0 && (
                <div className="mt-1 flex items-center justify-between text-white"><span>Shipping</span><span>${shippingAmount.toFixed(2)}</span></div>
              )}
              {isRental && listing.rentalDeposit && (
                <div className="mt-1 flex items-center justify-between text-sky-400">
                  <span className="text-sky-400">🔒 Refundable Deposit</span>
                  <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-white"><span>Buyer Protection</span><span>$1.00</span></div>
              <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2 text-sm font-bold text-white"><span>Total Due Today</span><span>${total.toFixed(2)}</span></div>
              {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-sky-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
            </div>

            {/* Next Steps */}
            <div className="mt-4 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02] px-4 py-3 text-left">
              <p className="text-[11px] font-bold text-sky-400 mb-2">What happens next?</p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">1️⃣</span>
                  <p className="text-[10px] text-sky-400/80">Order confirmed - Seller has received your shipping details</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">2️⃣</span>
                  <p className="text-[10px] text-sky-400/80">{isDigital ? "Download from your Purchases page" : deliveryMethod === "shipping" ? "Seller will ship to your address" : "Arrange pickup with seller"}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] mt-0.5">3️⃣</span>
                  <p className="text-[10px] text-sky-400/80">Track order status in your Purchases</p>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02] px-3 py-2 text-left text-[10px] leading-relaxed text-sky-400/80">
              💳 Secured by Stripe · 🛡️ Buyer Protection Active
            </div>
            <div className="mt-2 flex items-center justify-center gap-1 text-xs text-white">
              <span className="text-sky-400">✓</span>
              <span>Seller has been notified</span>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 space-y-2">
              <button
                onClick={() => router.push("/purchases")}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
              >
                View Order Details
              </button>
              <button
                onClick={() => router.push(`/messages?user=${encodeURIComponent(listing.sellerUsername || listing.sellerEmail || "")}&listing=${listing.id}&purchased=1`)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-white/[0.06] hover:border-white/[0.12]"
              >
                Message Seller
              </button>
              <button
                onClick={safeClose}
                className="w-full rounded-xl border border-transparent py-2 text-xs font-bold text-white transition hover:text-[var(--foreground)]"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Stepper */}
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <h2 className="text-sm font-black text-white">
                {step === "card" ? "Enter Card Details" : "Complete Purchase"}
              </h2>
              <button onClick={safeClose} className="rounded-lg p-2 text-white transition hover:bg-white/[0.05] hover:text-[var(--foreground)]">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Indicator */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 bg-gradient-to-r from-white/[0.02] to-transparent">
              {CHECKOUT_STEPS.map((stepItem, index) => {
                const currentIndex = getCurrentStepIndex();
                const isCompleted = index < currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <div key={stepItem.key} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-all ${
                      isCompleted ? 'bg-gradient-to-br from-sky-500 to-sky-400 text-white shadow-lg shadow-sky-500/20' : isCurrent ? 'bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-sky-400 ring-1 ring-sky-500/40' : 'bg-white/[0.03] text-white border border-white/[0.06]'
                    }`}>
                      {isCompleted ? '✓' : stepItem.icon}
                    </div>
                    <span className={`text-[10px] font-medium ${
                      isCompleted ? 'text-sky-400' : isCurrent ? 'text-white' : 'text-white'
                    }`}>
                      {stepItem.label}
                    </span>
                    {index < CHECKOUT_STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${
                        isCompleted ? 'bg-sky-500/50' : 'bg-white/[0.06]'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              {imageSrc && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.01]">
                  <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--foreground)]">{listing.title}</p>
                <p className="text-xs text-white">${listing.price}</p>
              </div>
              {/* Seller Trust Badge */}
              {sellerRating && (
                <div className="flex items-center gap-1 rounded-full bg-gradient-to-br from-sky-500/10 to-sky-500/5 px-2 py-1 border border-sky-500/20">
                  <span className="text-[10px]">⭐</span>
                  <span className="text-[10px] font-bold text-sky-400">{sellerRating.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="space-y-4 px-4 py-4">
              {step === "form" && (
                <>
                  {!isBadge && (listing.pickupAvailable && listing.shippingAvailable) && (
                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white">Delivery</label>
                      <div className="space-y-1.5">
                        {listing.pickupAvailable && (
                          <button
                            onClick={() => setDeliveryMethod("pickup")}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all ${
                              deliveryMethod === "pickup"
                                ? "border-sky-500/40 bg-sky-500/10 text-[var(--foreground)] shadow-[0_0_20px_rgba(14,165,233,0.1)]"
                                : "border-white/[0.06] bg-white/[0.02] text-white hover:border-white/[0.12] hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                              deliveryMethod === "pickup" ? "border-sky-500 bg-sky-500" : "border-white/[0.15]"
                            }`}>
                              {deliveryMethod === "pickup" && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <span>📍 Pickup available</span>
                          </button>
                        )}
                        {listing.shippingAvailable && (
                          <button
                            onClick={() => setDeliveryMethod("shipping")}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all ${
                              deliveryMethod === "shipping"
                                ? "border-sky-500/40 bg-sky-500/10 text-[var(--foreground)] shadow-[0_0_20px_rgba(14,165,233,0.1)]"
                                : "border-white/[0.06] bg-white/[0.02] text-white hover:border-white/[0.12] hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                              deliveryMethod === "shipping" ? "border-sky-500 bg-sky-500" : "border-white/[0.15]"
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
                    <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white">{isBadge ? "Your name" : "Your details"}</label>
                    <div className="space-y-2">
                      <input type="text" placeholder={isBadge ? "Full name" : "Full name"} value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                      {!isBadge && (
                        <input type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                      )}
                      {deliveryMethod === "shipping" && (
                        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-3">
                          <p className="text-[11px] font-medium text-white">Shipping address</p>
                          <input type="text" placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)}
                              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                            <input type="text" placeholder="Postcode" value={postcode} onChange={(e) => setPostcode(e.target.value)}
                              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                          </div>
                          <input type="text" placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)}
                            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-white hover:bg-white/[0.05] focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Summary with Protection */}
                  <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] px-3.5 py-3 text-xs">
                    <div className="flex items-center justify-between text-white">
                      <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                      <span>${rentalItemTotal.toFixed(2)}</span>
                    </div>
                    {deliveryMethod === "shipping" && shippingAmount > 0 && (
                      <div className="mt-1 flex items-center justify-between text-white">
                        <span>Shipping</span>
                        <span>${shippingAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {isRental && listing.rentalDeposit && (
                      <div className="mt-1 flex items-center justify-between text-amber-400">
                        <span className="text-amber-400">🔒 Refundable Deposit</span>
                        <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-white">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2 text-sm font-bold text-white">
                      <span>Total Due Today</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-sky-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
                  </div>

                  {/* Buyer Protection Banner */}
                  <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02] px-3.5 py-3">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">🛡️</span>
                      <div>
                        <p className="text-[11px] font-bold text-sky-400">Buyer Protection</p>
                        <p className="mt-1 text-[10px] text-sky-400/80 leading-relaxed">
                          Your payment is protected. If the item doesn't arrive or isn't as described, you may be eligible for a full refund.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Estimated Delivery */}
                  <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-sky-500/[0.02] px-3.5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📦</span>
                      <div>
                        <p className="text-[11px] font-bold text-sky-400">{getEstimatedDelivery()}</p>
                        {sellerResponseTime && (
                          <p className="mt-1 text-[10px] text-sky-400/70">Seller typically responds within {sellerResponseTime}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {intentError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                      {intentError}
                    </div>
                  )}
                </>
              )}

              {step === "card" && clientSecret && (
                <div>
                  <div className="rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.01] px-3.5 py-3 mb-4 text-xs">
                    <div className="flex items-center justify-between text-white">
                      <span>{isRental ? `Rental — $${listing.price}/day × ${listing.rentalDays || 1} day(s)` : "Item"}</span>
                      <span>${rentalItemTotal.toFixed(2)}</span>
                    </div>
                    {deliveryMethod === "shipping" && shippingAmount > 0 && (
                      <div className="mt-1 flex items-center justify-between text-white">
                        <span>Shipping</span>
                        <span>${shippingAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {isRental && listing.rentalDeposit && (
                      <div className="mt-1 flex items-center justify-between text-amber-400">
                        <span className="text-amber-400">🔒 Refundable Deposit</span>
                        <span>${Number(listing.rentalDeposit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-white">
                      <span>Buyer Protection</span>
                      <span>$1.00</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-white/[0.08] pt-2 text-sm font-bold text-white">
                      <span>Total Due Today</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                    {isRental && listing.rentalDeposit && <p className="mt-1 text-[10px] text-sky-400/70">${Number(listing.rentalDeposit).toFixed(2)} refundable after safe return.</p>}
                  </div>
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <PaymentForm total={total} listingId={listing.id} title={listing.title} price={String(total)} buyerEmail={buyerEmail} paymentIntentId={paymentIntentId} onSuccess={handlePaymentSuccess} onBack={resetToForm} badgeForSale={listing.badgeForSale} sellerEmail={listing.sellerEmail} collectionName={collectionName} type={listing.type} digitalFileURL={listing.digitalFileURL} digitalFileName={listing.digitalFileName} digitalStoragePath={listing.digitalStoragePath} />
                  </Elements>
                </div>
              )}
            </div>

            {step === "form" && (
              <div className="sticky bottom-0 border-t border-white/[0.08] bg-gradient-to-b from-black/80 to-black px-4 py-3 flex gap-2">
                <button
                  onClick={safeClose}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-bold text-[var(--muted)] transition hover:bg-white/[0.06] hover:border-white/[0.12] hover:text-[var(--foreground)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!isValid || submitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Starting..." : `Continue — $${total.toFixed(2)}`}
                </button>
              </div>
            )}

            {step === "processing" && (
              <div className="sticky bottom-0 border-t border-white/[0.08] bg-gradient-to-b from-black/80 to-black px-4 py-3">
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-white">
                  <svg className="h-4 w-4 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
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
