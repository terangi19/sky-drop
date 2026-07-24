"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import BrowseAwhinaAssistantPanel from "../components/BrowseAwhinaAssistantPanel";
import { useAwhinaInsightEffect } from "../contexts/AwhinaPageInsightContext";
import { buildPurchasesInsight } from "../lib/awhina-insights";
import { User } from "firebase/auth";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { getFreshIdToken } from "../lib/api-auth";
import { openDisputeRequest } from "../lib/open-dispute.client";
import { createNotification } from "../lib/notifications";
import { awardXP } from "../lib/xp";
import { showToast } from "../components/Toast";
import { sellerMessagesUrl, sellerProfileSlug } from "../lib/public-display";
import OrderReviewModal from "../components/OrderReviewModal";
import RefundStatusCard from "../components/RefundStatusCard";
import { REFUND_BADGE_CLASS } from "../lib/refund-display";
import { getBuyerNextAction } from "../lib/purchase-order-actions";
import { normalizePurchaseStatus, purchaseStatusLabel } from "../lib/purchase-status";
import { canBuyerReview } from "../lib/order-reviews";

interface Purchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  sellerEmail: string;
  sellerUsername?: string;
  sellerId?: string;
  buyerEmail: string;
  buyerName: string;
  buyerPhone: string;
  deliveryMethod: "pickup" | "shipping" | "badge" | "digital" | "service" | "rental";
  shippingAddress?: string;
  shippingFee: number;
  total: number;
  status: string;
  paidAt?: any;
  createdAt?: any;
  pickupArea?: string;
  badgeTransfer?: string;
  freeShipping?: boolean;
  tracking?: string;
  trackingNumber?: string;
  paymentType?: string;
  estimatedDays?: number;
  type?: string;
  digitalFileURL?: string;
  digitalFileName?: string;
  disputeDeadline?: any;
  disputeStatus?: string;
  fundsReleased?: boolean;
  refundAmount?: number;
  refundedAt?: any;
  stripePaymentIntentId?: string;
  rentalDays?: number;
  rentalStart?: any;
  rentalEnd?: any;
  reviewed?: boolean;
  buyerReviewed?: boolean;
}

const DISPUTE_LABELS: Record<string, string> = {
  open: "Dispute Open",
  under_review: "Under Review",
  resolved_buyer: "Resolved — You Won",
  resolved_seller: "Resolved — Seller",
  refunded: "Fully refunded",
};

const DISPUTE_STYLES: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  under_review: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  resolved_buyer: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  resolved_seller: "bg-zinc-500/10 text-[var(--muted)] border-zinc-500/20",
  refunded: REFUND_BADGE_CLASS,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  seller_confirming: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  in_progress: "In Progress",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Fully refunded",
  rented: "Rented",
  returned: "Returned",
  arrange_requested: "Arrangement Requested",
  awaiting_payment: "Awaiting Payment",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: "Waiting for seller confirmation",
  confirmed: "Payment received - Order confirmed",
  seller_confirming: "Seller has confirmed your order",
  preparing: "Seller is preparing your order",
  ready_for_pickup: "Order is ready for pickup",
  in_progress: "Service in progress",
  shipped: "Item has been shipped",
  delivered: "Order completed",
  cancelled: "Order was cancelled",
  refunded: "This order has been fully refunded",
  rented: "Item is rented",
  returned: "Item has been returned",
  arrange_requested: "Waiting for seller to arrange payment",
  awaiting_payment: "Contact seller to arrange payment",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  seller_confirming: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  preparing: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ready_for_pickup: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  in_progress: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  shipped: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  delivered: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  refunded: REFUND_BADGE_CLASS,
  rented: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  returned: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  arrange_requested: "bg-sky-500/10 text-sky-400",
  awaiting_payment: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const TIMELINE_STEPS = [
  { key: "confirmed", label: "Confirmed", icon: "✅" },
  { key: "shipped", label: "Shipped", icon: "📦" },
  { key: "delivered", label: "Delivered", icon: "🏠" },
];
const SERVICE_TIMELINE_STEPS = [
  { key: "confirmed", label: "Confirmed", icon: "✅" },
  { key: "in_progress", label: "In Progress", icon: "⚙️" },
  { key: "delivered", label: "Delivered", icon: "🏠" },
];
const RENTAL_TIMELINE_STEPS = [
  { key: "confirmed", label: "Confirmed", icon: "✅" },
  { key: "rented", label: "Rented", icon: "🔑" },
  { key: "returned", label: "Returned", icon: "↩️" },
  { key: "completed", label: "Completed", icon: "✅" },
];
const ARRANGE_TIMELINE_STEPS = [
  { key: "arrange_requested", label: "Requested", icon: "📝" },
  { key: "seller_confirming", label: "Confirmed", icon: "✅" },
  { key: "delivered", label: "Completed", icon: "🏠" },
];

function formatDate(ts: any): string {
  if (!ts) return "";
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  return new Date(ts).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function getDisputeDeadlineCountdown(deadline: any): { days: number; text: string; urgent: boolean } | null {
  if (!deadline) return null;
  const deadlineDate = deadline.seconds ? new Date(deadline.seconds * 1000) : new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  if (diffMs <= 0) return null;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return {
    days,
    text: `${days} day${days !== 1 ? "s" : ""} remaining`,
    urgent: days <= 2
  };
}

function statusIndex(s: string, isService?: boolean, isRental?: boolean, isArrange?: boolean): number {
  const steps = isArrange ? ARRANGE_TIMELINE_STEPS : isRental ? RENTAL_TIMELINE_STEPS : isService ? SERVICE_TIMELINE_STEPS : TIMELINE_STEPS;
  const norm = normalizePurchaseStatus(s);
  let lookup = s;
  if (norm === "seller_confirming" || norm === "preparing") lookup = "confirmed";
  else if (norm === "ready_for_pickup") lookup = "shipped";
  const i = steps.findIndex((step) => step.key === lookup);
  return i >= 0 ? i : -1;
}

function timelineSteps(isService?: boolean, isRental?: boolean, isArrange?: boolean): Array<{ key: string; label: string; icon: string }> {
  return isArrange ? ARRANGE_TIMELINE_STEPS : isRental ? RENTAL_TIMELINE_STEPS : isService ? SERVICE_TIMELINE_STEPS : TIMELINE_STEPS;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price-low", label: "Price ↑" },
  { value: "price-high", label: "Price ↓" },
] as const;

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default function PurchasesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(10);
  const [reviewModal, setReviewModal] = useState<Purchase | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSending, setReviewSending] = useState(false);
  const [editAddress, setEditAddress] = useState<Purchase | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [disputeModal, setDisputeModal] = useState<Purchase | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeSending, setDisputeSending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "purchases"), where("buyerEmail", "==", user.email), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setPurchases(items);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load purchases:", err);
      if (err.code === "permission-denied") {
        setError("You don't have permission to view purchases. Please sign in again.");
      } else if (err.code === "unavailable") {
        setError("Service temporarily unavailable. Please try again.");
      } else {
        setError(`Could not load purchases: ${err.message || "Check your connection."}`);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

  async function updateStatus(id: string, status: string) {
    const token = await getFreshIdToken();
    if (!token) {
      showToast("Please sign in again.", "error");
      return;
    }

    const res = await fetch("/api/update-purchase-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ purchaseId: id, status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Could not update order", "error");
      return;
    }

    showToast(
      status === "delivered" ? "Receipt confirmed — seller will be notified." :
      status === "shipped" ? "📦 Order status updated to shipped" :
      status === "in_progress" ? "⚙️ Service marked as in progress" :
      "Order status updated successfully",
      "success"
    );

    const purchase = purchases.find((p) => p.id === id);
    if (!purchase) return;

    try {
      if (status === "delivered") {
        if (user?.uid) await awardXP(user.uid, 25);
        const buyerLabel = user?.email ? user.email.split("@")[0] : "Buyer";
        await createNotification({
          targetEmail: purchase.sellerEmail,
          fromEmail: user?.email || purchase.buyerEmail,
          type: "delivered",
          title: "Buyer Confirmed Receipt",
          message: `${buyerLabel} confirmed receipt of "${purchase.listingTitle}". The order is complete.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
          total: purchase.total,
        });
        setReviewModal(purchase);
      }
    } catch (e) {
      console.error("Post-confirm notifications:", e);
    }
  }

  async function saveAddress() {
    if (!editAddress || !newAddress.trim()) return;
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) { showToast("Please sign in again", "error"); return; }
      const res = await fetch("/api/update-purchase-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purchaseId: editAddress.id, shippingAddress: newAddress.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save address");
      }
      setEditAddress(null);
      setNewAddress("");
    } catch (e: any) { console.error("Failed to update address:", e); showToast(e.message || "Failed to save address", "error"); }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: purchases.length };
    for (const p of purchases) {
      const key = p.status === "delivered" || p.status === "cancelled" ? p.status : "active";
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [purchases]);

  const filtered = useMemo(() => {
    let items = [...purchases];

    if (filter === "active") items = items.filter((p) => !["delivered", "cancelled"].includes(p.status));
    else if (filter !== "all") items = items.filter((p) => p.status === filter);

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) => p.listingTitle.toLowerCase().includes(q) || p.sellerEmail?.toLowerCase().includes(q));
    }

    if (sort === "oldest") items.reverse();
    else if (sort === "price-high") items.sort((a, b) => Number(b.total) - Number(a.total));
    else if (sort === "price-low") items.sort((a, b) => Number(a.total) - Number(b.total));

    return items;
  }, [purchases, filter, search, sort]);

  const awhinaInsight = useMemo(
    () => buildPurchasesInsight(purchases, () => setFilter("active")),
    [purchases]
  );
  useAwhinaInsightEffect(awhinaInsight);

  function nextAction(p: Purchase): { label: string; action: string; color: string; badge?: string } | null {
    if (p.disputeStatus || p.status === "refunded") return null;
    const action = getBuyerNextAction(p);
    if (!action) return null;
    return {
      label: action.label,
      action: action.status,
      color: action.color || "bg-emerald-500",
    };
  }

  function deliveryLabel(p: Purchase): { icon: string; text: string; badge: string } {
    if (p.deliveryMethod === "pickup") return { icon: "📍", text: p.pickupArea ? `Pickup — ${p.pickupArea}` : "Local Pickup", badge: "Pickup" };
    if (p.freeShipping) return { icon: "🚚", text: "Free Shipping", badge: "Free Shipping" };
    if (p.deliveryMethod === "digital") return { icon: "📥", text: "Digital Download", badge: "Digital" };
    if (p.deliveryMethod === "service") return { icon: "🤝", text: "Service", badge: "Service" };
    if (p.deliveryMethod === "rental") return { icon: "🔑", text: p.rentalDays ? `Rental — ${p.rentalDays} day(s)` : "Rental", badge: "Rental" };
    return { icon: "📦", text: p.shippingFee ? `Shipping — $${p.shippingFee}` : "Shipping", badge: "Shipping" };
  }

  // Simple Status Component
  function PurchaseTimeline({ purchase, isService, isRental, isArrange, isWanted }: { purchase: Purchase; isService?: boolean; isRental?: boolean; isArrange?: boolean; isWanted?: boolean }) {
    if (isWanted) {
      return (
        <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/20">
              <span className="text-lg">📋</span>
            </div>
            <div>
              <p className="text-sm font-medium text-sky-400">Wanted Listing</p>
              <p className="text-[10px] text-sky-400/80">Sellers can message you about this request</p>
            </div>
          </div>
        </div>
      );
    }

    if (purchase.status === "refunded") {
      return (
        <RefundStatusCard
          role="buyer"
          refundAmount={purchase.refundAmount}
          refundedAt={purchase.refundedAt}
          total={purchase.total}
          className="mt-3"
        />
      );
    }

    const isCompleted = purchase.status === "delivered";
    const isDisputed = !!purchase.disputeStatus;
    
    if (isCompleted) {
      return (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-400">Order Completed</p>
              <p className="text-[10px] text-emerald-400/80">Your purchase has been successfully delivered.</p>
            </div>
          </div>
        </div>
      );
    }
    
    if (isDisputed) {
      return (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <p className="text-xs font-medium text-red-400">{DISPUTE_LABELS[purchase.disputeStatus!] || "Dispute"}</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${STATUS_STYLES[purchase.status]}`}>
            <span className="text-lg">{STATUS_LABELS[purchase.status]?.charAt(0) || "•"}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{purchaseStatusLabel(purchase.status)}</p>
            {STATUS_DESCRIPTIONS[purchase.status] && (
              <p className="text-[10px] text-[var(--muted)]">{STATUS_DESCRIPTIONS[purchase.status]}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--card)]/50 hover:text-[var(--foreground)] mb-5 sm:mb-6 group">
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>

        <div className="relative mb-8 sm:mb-10 text-center">
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/10 via-sky-300/5 to-purple-500/10 blur-3xl pointer-events-none" />
          <div className="relative inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] font-bold text-sky-300 mb-4 tracking-wide uppercase">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M5 8l7-5 7 5M12 3v9" /></svg>
            Orders
          </div>
          <h1 className="relative text-3xl sm:text-4xl font-black tracking-tight text-[var(--foreground)]">
            My Purchases
          </h1>
          <BrowseAwhinaAssistantPanel className="mt-4 mb-0 mx-auto w-full max-w-2xl text-left" />
          <p className="relative mt-3 text-sm text-[var(--muted)]">{purchases.length} total · {counts.active || 0} active</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder="Search purchases..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--soft-card)] pl-10 pr-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-[var(--card-hover)] focus:ring-2 focus:ring-sky-500/10" />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-1">
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setSort(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  sort === opt.value ? "bg-sky-500/15 text-sky-300 border border-sky-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.03]"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mobile-h-scroll mb-6 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-1.5">
          {FILTER_TABS.map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 min-h-[40px] ${
                filter === tab.key ? "bg-sky-500/15 text-sky-300 border border-sky-500/20" : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.03]"
              }`}>
              {tab.label}{counts[tab.key] > 0 ? ` (${counts[tab.key]})` : ""}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-800/40 bg-red-900/20 p-4 text-sm text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4 sm:p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-[var(--card)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-[var(--card)]" />
                    <div className="h-3 w-20 rounded bg-[var(--card)]" />
                    <div className="h-3 w-32 rounded bg-[var(--card)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)]">
              <svg className="h-8 w-8 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Nothing here yet</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Items you buy will show up here.</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-always-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.97]">
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, visibleCount).map((p) => {
              const dl = deliveryLabel(p);
              const action = nextAction(p);
              const isService = p.deliveryMethod === "service";
              const isRental = p.deliveryMethod === "rental";
              const isArrange = p.paymentType === "contact";
              const isWanted = p.type === "wanted";
              const isRefunded = p.status === "refunded";
              const displayStatus = isWanted
                ? { label: "Wanted", style: "bg-sky-500/10 text-sky-400 border-sky-500/20" }
                : isRefunded
                  ? null
                  : { label: purchaseStatusLabel(p.status), style: STATUS_STYLES[p.status] || STATUS_STYLES[normalizePurchaseStatus(p.status)] || "bg-[var(--card)]/50 text-[var(--muted)] border-zinc-700/50" };
              return (
                <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4 sm:p-5 transition-all duration-200 hover:bg-[var(--card-hover)] hover:border-[var(--card-border)] hover:shadow-lg hover:shadow-black/10">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start gap-3 sm:gap-4">
                    <Link href={`/post/listing/${p.listingId}`} className="shrink-0">
                      <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-[var(--card)] ring-2 ring-[var(--card-border)] transition-transform duration-300 group-hover:scale-[1.03]">
                        {p.listingImage ? (
                          <img src={p.listingImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-[var(--muted)]">—</div>
                        )}
                      </div>
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/post/listing/${p.listingId}`} className="text-sm font-bold text-[var(--foreground)] transition hover:text-sky-400 line-clamp-1">{p.listingTitle}</Link>
                          <p className="mt-0.5 text-sm font-semibold text-sky-400">${Number(p.listingPrice).toFixed(2)}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                            <Link href={`/seller/${sellerProfileSlug(p)}`} className="hover:text-sky-400 transition-colors">Seller</Link>
                            {p.createdAt && <span>· {formatDate(p.createdAt)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          {displayStatus && (
                            <span className={`shrink-0 rounded-full border border-[var(--card-border)] px-3 py-0.5 text-[10px] font-bold ${displayStatus.style}`}>
                              {displayStatus.label}
                            </span>
                          )}
                                                    {(p as any).destinationCharge && !p.fundsReleased && p.status !== "completed" && p.status !== "refunded" && (
                            <span className="shrink-0 rounded-full border border-sky-500/15 bg-sky-500/[0.04] px-2.5 py-0.5 text-[9px] font-medium text-sky-400/70">
                              💳 Paid to Seller
                            </span>
                          )}
                        </div>
                      </div>

                      {/* TradeMe-style Timeline */}
                      <PurchaseTimeline purchase={p} isService={isService} isRental={isRental} isArrange={isArrange} isWanted={isWanted} />

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                        <span>{dl.icon} {dl.text}</span>
                      </div>
                      {(p.tracking || p.trackingNumber) &&
                        !isWanted &&
                        !isRefunded &&
                        ["shipped", "delivered"].includes(p.status) && (
                        <p className="mt-1.5 rounded-lg border border-sky-500/15 bg-sky-500/5 px-2.5 py-1.5 text-[11px] text-sky-300/90">
                          <span className="font-bold text-sky-400">Tracking: </span>
                          {p.tracking || p.trackingNumber}
                        </p>
                      )}

                      {p.disputeStatus && p.disputeStatus !== "resolved_seller" && p.status !== "refunded" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${DISPUTE_STYLES[p.disputeStatus] || "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                            {p.disputeStatus === "refunded" ? "✅ " : "⚠️ "}{DISPUTE_LABELS[p.disputeStatus] || p.disputeStatus}
                          </span>
                        </div>
                      )}
                      {p.status === "delivered" && !p.disputeStatus && !p.fundsReleased && (() => {
                        const countdown = getDisputeDeadlineCountdown(p.disputeDeadline);
                        if (!countdown) return null;
                        return (
                          <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium ${countdown.urgent ? "border-red-500/20 bg-red-500/5 text-red-400" : "border-sky-500/15 bg-sky-500/5 text-sky-300/90"}`}>
                            ⏰ Dispute deadline: {countdown.text}
                          </div>
                        );
                      })()}

                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <Link href={sellerMessagesUrl(p, p.listingId)}
                          className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:bg-[var(--card-hover)] hover:text-[var(--foreground)] active:scale-[0.97]">
                          Message
                        </Link>
                        {p.deliveryMethod === "digital" && p.digitalFileURL && p.status === "delivered" && (
                          <a href={p.digitalFileURL} target="_blank" rel="noopener noreferrer" download={p.digitalFileName}
                            className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-[11px] font-bold text-always-white shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                            📥 Download
                          </a>
                        )}
                        {canBuyerReview(p) && (
                          <button onClick={() => { setReviewModal(p); setReviewRating(0); setReviewText(""); }}
                            className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-1.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/10 active:scale-[0.97]">
                            Review Seller
                          </button>
                        )}
                        {p.deliveryMethod === "shipping" && !["delivered", "cancelled"].includes(p.status) && (
                          <button onClick={() => { setEditAddress(p); setNewAddress(p.shippingAddress || ""); }}
                            className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:bg-[var(--card-hover)] active:scale-[0.97]">
                            Edit Address
                          </button>
                        )}
                        {["delivered", "shipped", "seller_confirming"].includes(p.status) && p.status !== "refunded" && !p.disputeStatus && !p.fundsReleased && (!p.disputeDeadline || new Date(p.disputeDeadline.seconds * 1000 || p.disputeDeadline) > new Date()) && (
                          <button onClick={() => { setDisputeModal(p); setDisputeReason(""); setDisputeDescription(""); }}
                            className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 active:scale-[0.97]">
                            ⚠️ Dispute
                          </button>
                        )}
                        {action && !p.disputeStatus && p.status !== "refunded" && (
                          <button onClick={() => updateStatus(p.id, action.action)}
                            className={`rounded-lg ${action.color} px-3 py-1.5 text-[11px] font-bold text-always-white transition hover:brightness-110 active:scale-[0.97]`}>
                            {action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visibleCount < filtered.length && (
              <div className="flex justify-center pt-2">
                <button onClick={() => setVisibleCount(prev => prev + 10)}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-2.5 text-xs font-bold text-[var(--muted)] transition hover:bg-[var(--card)]/40 hover:text-[var(--foreground)] active:scale-[0.97]">
                  Load More ({filtered.length - visibleCount})
                </button>
              </div>
            )}

            <OrderReviewModal
              open={!!reviewModal}
              title="Review Seller"
              subtitle={reviewModal?.listingTitle || ""}
              rating={reviewRating}
              comment={reviewText}
              sending={reviewSending}
              onRatingChange={setReviewRating}
              onCommentChange={setReviewText}
              onClose={() => setReviewModal(null)}
              onSubmit={async () => {
                if (!reviewModal) return;
                setReviewSending(true);
                try {
                  const token = await getFreshIdToken();
                  if (!token) {
                    showToast("Please sign in again.", "error");
                    setReviewSending(false);
                    return;
                  }
                  const res = await fetch("/api/submit-review", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      purchaseId: reviewModal.id,
                      rating: reviewRating,
                      reviewText: reviewText.trim(),
                    }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    showToast(data.error || "Failed to submit review", "error");
                    setReviewSending(false);
                    return;
                  }
                  showToast("Review submitted. Thank you!", "success");
                  setReviewModal(null);
                  setReviewRating(0);
                  setReviewText("");
                } catch (e) {
                  console.error(e);
                  showToast("Failed to submit review", "error");
                }
                setReviewSending(false);
              }}
            />
          </div>
        )}
      </div>

      {editAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditAddress(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Update Address</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{editAddress.listingTitle}</p>
            <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="New shipping address"
              className="mt-4 w-full rounded-xl border border-[var(--input-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setEditAddress(null)} className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={saveAddress} className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-always-white shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">Save</button>
            </div>
          </div>
        </div>
      )}

      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDisputeModal(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Open a Dispute</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{disputeModal.listingTitle}</p>
            <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
              Admins review disputes using your <strong className="text-[var(--foreground)]">Sky Drop Messages</strong> with the seller — what was agreed, tracking, and timelines. Describe the issue below and mention anything important from chat. We cannot review SMS, WhatsApp, or email.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] mb-1 block">Reason</label>
                <select value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500">
                  <option value="">Select a reason...</option>
                  <option value="not_received">Item not received</option>
                  <option value="not_as_described">Not as described</option>
                  <option value="damaged">Damaged or defective</option>
                  <option value="wrong_item">Wrong item received</option>
                  <option value="digital_issue">Digital download issue</option>
                  <option value="service_issue">Service not completed</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--muted)] mb-1 block">Describe the issue</label>
                <textarea value={disputeDescription} onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={4} className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]"
                  placeholder="Explain what happened in detail..." />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setDisputeModal(null)} className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card)] py-3 text-sm font-bold text-[var(--foreground)] hover:bg-[var(--card-hover)] active:scale-[0.97] transition-all">Cancel</button>
              <button disabled={!disputeReason || !disputeDescription.trim() || disputeSending} onClick={async () => {
                setDisputeSending(true);
                try {
                  await openDisputeRequest({
                    purchaseId: disputeModal.id,
                    reason: disputeReason,
                    description: disputeDescription.trim(),
                  });
                  setDisputeModal(null);
                  showToast("Dispute opened. Admin will review shortly.");
                } catch (e) {
                  console.error(e);
                  showToast(e instanceof Error ? e.message : "Failed to open dispute. Try again.", "error");
                }
                setDisputeSending(false);
              }} className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-sky-500 py-3 text-sm font-bold text-always-white shadow-red-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50">
                {disputeSending ? "Opening..." : "Open Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
