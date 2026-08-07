"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import BrowseAwhinaAssistantPanel from "../components/BrowseAwhinaAssistantPanel";
import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { getFreshIdToken } from "../lib/api-auth";
import { canSellerConfirmArrangeSale } from "../lib/arrange-purchase-status";
import { createNotification } from "../lib/notifications";
import { awardXP } from "../lib/xp";
import { showToast } from "../components/Toast";
import { isEmailLike, sellerMessagesUrl } from "../lib/public-display";
import { useAwhinaInsightEffect } from "../contexts/AwhinaPageInsightContext";
import { buildSalesInsight } from "../lib/awhina-insights";
import RefundStatusCard from "../components/RefundStatusCard";
import { REFUND_BADGE_CLASS } from "../lib/refund-display";
import {
  getSellerOrderActions,
  getSellerWaitingMessage,
  isSellerWaitingForBuyer,
  sellerOffersBothFulfillmentPaths,
} from "../lib/purchase-order-actions";
import { purchaseStatusLabel } from "../lib/purchase-status";
import OrderReviewModal from "../components/OrderReviewModal";
import { canSellerReview } from "../lib/order-reviews";
import HistoricalOrdersNotice from "../components/HistoricalOrdersNotice";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";

interface Purchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  sellerEmail: string;
  buyerEmail: string;
  buyerUsername?: string;
  buyerId?: string;
  buyerName: string;
  buyerPhone: string;
  deliveryMethod: string;
  shippingAddress?: string;
  shippingFee: number;
  total: number;
  status: string;
  paidAt?: any;
  createdAt?: any;
  badgeTransfer?: string;
  disputeStatus?: string;
  tracking?: string;
  trackingNumber?: string;
  paymentType?: string;
  refundAmount?: number;
  refundedAt?: any;
  sellerReviewed?: boolean;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
}

const statusStyles: Record<string, string> = {
  arrange_requested: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  pending: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  confirmed: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  seller_confirming: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  preparing: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ready_for_pickup: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  shipped: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_progress: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  delivered: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  completed: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  refunded: REFUND_BADGE_CLASS,
  rented: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  returned: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function formatDate(ts: any): string {
  if (!ts) return "";
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  return new Date(ts).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: string): string {
  return purchaseStatusLabel(status);
}

function deliveryMethodLabel(s: Purchase): string {
  const method = String(s.deliveryMethod || "").toLowerCase();
  if (method === "either" || method === "arrange" || method === "undecided") {
    return "Pickup or shipping";
  }
  if (method === "shipping") return "Shipping";
  if (method === "pickup") {
    if (sellerOffersBothFulfillmentPaths(s)) return "Pickup or shipping";
    return "Pickup";
  }
  if (method === "digital") return "Digital";
  if (method === "badge") return "Badge transfer";
  return method || "—";
}

function sellerActionsForSale(s: Purchase) {
  return getSellerOrderActions(s);
}

export default function SalesPage() {
  const [user, setUser] = useState<User | null>(null);
  const userEmailRef = useRef<string | null>(null);
  const [sales, setSales] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string; needsTracking?: boolean } | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sellerStripeId, setSellerStripeId] = useState("");
  const [filter, setFilter] = useState("active");
  const ordersRef = useRef<HTMLDivElement>(null);
  const [confirmingSaleId, setConfirmingSaleId] = useState<string | null>(null);
  const [reviewModal, setReviewModal] = useState<Purchase | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSending, setReviewSending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); userEmailRef.current = u?.email || null; });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "profiles", user.uid)).then((snap) => {
      if (snap.exists()) setSellerStripeId(snap.data().stripeAccountId || "");
    }).catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.email) return;
    getFreshIdToken()
      .then((token) => {
        if (!token) return;
        return fetch("/api/repair-arrange-sales", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .catch(() => {});
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "purchases"), where("sellerEmail", "==", user.email), orderBy("createdAt", "desc"), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setSales(items);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load sales:", err);
      if (err.code === "permission-denied") {
        setError("You don't have permission to view sales. Please sign in again.");
      } else if (err.code === "unavailable") {
        setError("Service temporarily unavailable. Please try again.");
      } else {
        setError(`Could not load sales: ${err.message || "Check your connection."}`);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

  const salesInsight = useMemo(
    () => buildSalesInsight(sales, () => {
      setFilter("active");
      ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
    [sales]
  );
  useAwhinaInsightEffect(salesInsight);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sales.length };
    for (const s of sales) {
      const key = s.status === "completed" || s.status === "cancelled" ? s.status : "active";
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [sales]);

  const filtered = useMemo(() => {
    let items = [...sales];
    if (filter === "active") items = items.filter((s) => !["completed", "cancelled", "refunded"].includes(s.status));
    else if (filter !== "all") items = items.filter((s) => s.status === filter);
    return items;
  }, [sales, filter]);

  async function confirmArrangeSale(purchaseId: string) {
    setConfirmingSaleId(purchaseId);
    try {
      const token = await getFreshIdToken();
      if (!token) {
        showToast("Please sign in again.", "error");
        return;
      }
      const res = await fetch("/api/confirm-arrange-sale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ purchaseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not confirm sale", "error");
        return;
      }
      showToast("Marked as sold. Listing updated.", "success");
    } catch {
      showToast("Could not confirm sale", "error");
    } finally {
      setConfirmingSaleId(null);
    }
  }

  async function updateStatus(
    purchaseId: string,
    newStatus: string,
    tracking?: string
  ) {
    const token = await getFreshIdToken();
    if (!token) {
      showToast("Please sign in again.", "error");
      throw new Error("Not signed in");
    }

    const res = await fetch("/api/update-purchase-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        purchaseId,
        status: newStatus,
        tracking: tracking?.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || "Failed to update order";
      showToast(msg, "error");
      throw new Error(msg);
    }

    const purchase = sales.find((s) => s.id === purchaseId);
    if (!purchase) return;

    const currentEmail = userEmailRef.current || user?.email || "";
    try {
      if (newStatus === "seller_confirming") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "order_confirmed",
          title: "Order Confirmed",
          message: `Your order for "${purchase.listingTitle}" has been confirmed by the seller. They'll prepare your item and update the status when shipped.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "preparing") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "order_preparing",
          title: "Order Preparing",
          message: `Your order for "${purchase.listingTitle}" is being prepared by the seller. You'll be notified when it's ready.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "ready_for_pickup") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "ready_for_pickup",
          title: "Ready for Pickup",
          message: `Your order for "${purchase.listingTitle}" is ready for pickup! Confirm receipt in your purchases once you've collected it.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "shipped") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "item_shipped",
          title: "Item Shipped",
          message: `Your item "${purchase.listingTitle}" has been shipped. Confirm receipt in your purchases when it arrives.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "returned" && purchase.deliveryMethod === "rental") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "item_returned",
          title: "Item Returned",
          message: `The seller confirmed return of "${purchase.listingTitle}". Rental completed! Thanks for using Sky Drop.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "delivered" && user?.uid) {
        await awardXP(user.uid, 50);
      }

      if (newStatus === "completed") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: currentEmail,
          type: "service_completed",
          title: "Service Completed",
          message: `Your service "${purchase.listingTitle}" has been marked as complete by the seller. Please confirm you're satisfied to complete the order.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }
    } catch (e) {
      console.error("Failed to send order notifications:", e);
    }
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200 mb-5 sm:mb-6 group">
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="relative mb-8 sm:mb-10 text-center">
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/10 via-sky-300/5 to-purple-500/10 blur-3xl pointer-events-none" />
          <div className="relative inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[10px] font-bold text-sky-300 mb-4 tracking-wide uppercase">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
            Seller
          </div>
          <h1 className="relative text-3xl sm:text-4xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-white via-sky-200 to-white bg-clip-text text-transparent">Sales</span>
          </h1>
          <BrowseAwhinaAssistantPanel className="mt-4 mb-0 mx-auto w-full max-w-2xl text-left" />
        </div>

        <HistoricalOrdersNotice audience="seller" />

        <div ref={ordersRef} />
        {/* Status filter tabs */}
        <div className="mobile-h-scroll mb-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1.5">
          {[
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "all", label: "All" },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 min-h-[40px] ${
                filter === tab.key ? "bg-sky-500/15 text-sky-300 border border-sky-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}>
              {tab.label}{counts[tab.key] > 0 ? ` (${counts[tab.key]})` : ""}
            </button>
          ))}
        </div>

        {isStripeCheckoutVisibleClient() && !sellerStripeId && sales.some(s => s.paymentType !== "contact") && (
          <div className="mb-6 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4 text-sm">
            <p className="font-bold text-sky-400">⚠️ Stripe Not Connected</p>
            <p className="mt-1 text-sky-400/70">Connect Stripe to receive payouts from your sales. <Link href="/profile?tab=payouts" className="text-sky-400 underline hover:text-sky-300">Go to Profile →</Link></p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-800/40 bg-red-900/20 p-4 text-sm text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-5 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-xl bg-white/[0.03]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-white/[0.03]" />
                    <div className="h-3 w-20 rounded bg-white/[0.03]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No {filter === "active" ? "active " : filter === "completed" ? "completed " : filter === "cancelled" ? "cancelled " : ""}sales yet</h2>
            <p className="mt-2 text-sm text-zinc-500">{filter === "all" ? "When someone buys your items, they'll show up here." : `No sales match the "${filter}" filter.`}</p>
            <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.97]">
              Create a Listing
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const isRefunded = s.status === "refunded";
              const sellerActions = sellerActionsForSale(s);
              const waitingForBuyer = isSellerWaitingForBuyer(s);
              return (
              <div key={s.id} className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 sm:p-5 transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.10] hover:shadow-lg hover:shadow-black/20">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="flex items-start gap-3 sm:gap-4">
                  <Link href={`/post/listing/${s.listingId}`} className="shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 ring-2 ring-white/[0.06] transition-transform duration-300 group-hover:scale-[1.03]">
                      {s.listingImage ? (
                        <img src={s.listingImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                      )}
                    </div>
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/post/listing/${s.listingId}`} className="text-sm font-bold text-[var(--foreground)] transition hover:text-sky-400 line-clamp-1">{s.listingTitle}</Link>
                        <p className="mt-0.5 text-sm font-semibold text-sky-400">${s.listingPrice}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>
                            {s.buyerName && !isEmailLike(s.buyerName)
                              ? s.buyerName.startsWith("@")
                                ? s.buyerName
                                : `@${s.buyerName}`
                              : "Buyer"}
                          </span>
                          <span>· {deliveryMethodLabel(s)}</span>
                          {s.createdAt && <span>· {formatDate(s.createdAt)}</span>}
                        </div>
                      </div>
                      {!isRefunded && (
                        <span className={`shrink-0 rounded-full border px-3 py-0.5 text-[10px] font-bold ${statusStyles[s.status] || "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"}`}>
                          {statusLabel(s.status)}
                        </span>
                      )}
                      {s.disputeStatus && !isRefunded && (
                        <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-0.5 text-[10px] font-bold text-red-400">
                          ⚠️ Dispute
                        </span>
                      )}
                    </div>

                    {isRefunded && (
                      <RefundStatusCard
                        role="seller"
                        refundAmount={s.refundAmount}
                        refundedAt={s.refundedAt}
                        total={s.total}
                        className="mt-3"
                      />
                    )}

                    {s.deliveryMethod === "shipping" && s.shippingAddress && !isRefunded && (
                      <p className="mt-1.5 text-[11px] text-zinc-600">📍 Ship to: {s.shippingAddress}</p>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {canSellerConfirmArrangeSale(s.status, (s as { paymentType?: string }).paymentType) ? (
                        <button
                          onClick={() => confirmArrangeSale(s.id)}
                          disabled={confirmingSaleId === s.id}
                          className="rounded-lg bg-sky-500 px-4 py-1.5 text-[11px] font-bold text-white transition hover:bg-sky-400 disabled:opacity-60 active:scale-[0.97]"
                        >
                          {confirmingSaleId === s.id ? "Updating…" : "Mark sold to buyer"}
                        </button>
                      ) : null}
                      {sellerActions.length > 0 && !s.disputeStatus && !isRefunded
                        ? sellerActions.map((sellerAction) => (
                            <button
                              key={sellerAction.status}
                              onClick={() =>
                                setConfirmAction({
                                  id: s.id,
                                  status: sellerAction.status,
                                  label: sellerAction.label,
                                  needsTracking: sellerAction.needsTracking,
                                })
                              }
                              className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-500 px-4 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]"
                            >
                              {sellerAction.label}
                            </button>
                          ))
                        : null}
                      {waitingForBuyer && !isRefunded && (
                        <span className="text-[11px] font-bold text-amber-400/90">
                          ⏳ {getSellerWaitingMessage(s)}
                        </span>
                      )}
                      {(s as any).paymentType === "contact" && !isRefunded ? (
                        <span className="text-[11px] text-sky-400/80 font-bold">🤝 Arrange Purchase — payment off-platform</span>
                      ) : (s as any).destinationCharge && s.status !== "refunded" ? (
                        <span className="text-[11px] text-sky-400 font-bold">✅ Paid to your Stripe account at checkout</span>
                      ) : s.status === "delivered" && !(s as any).orderCompleted && !(s as any).fundsReleased ? (
                        <span className="text-[11px] text-sky-400 font-bold">⏳ Awaiting order completion</span>
                      ) : null}
                      {((s as any).orderCompleted || (s as any).fundsReleased) && !isRefunded && (
                        <span className="text-[11px] text-sky-400 font-bold">✅ Order complete</span>
                      )}
                      {canSellerReview(s) && (
                        <button
                          onClick={() => {
                            setReviewModal(s);
                            setReviewRating(0);
                            setReviewText("");
                          }}
                          className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-1.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/10 active:scale-[0.97]"
                        >
                          Review Buyer
                        </button>
                      )}
                      <Link href={sellerMessagesUrl(s, s.listingId)}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-300 active:scale-[0.97]">
                        Message
                      </Link>
                      {s.buyerPhone && (
                        <span className="text-[11px] text-zinc-600">📞 {s.buyerPhone}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )}
      </section>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-lg font-black text-[var(--foreground)]">Mark as {confirmAction.label}?</h3>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">This will update the order status and notify the buyer.</p>
            {confirmAction.status === "shipped" && confirmAction.needsTracking && (
              <div className="mt-4">
                <label className="mb-1 block text-xs font-bold text-[var(--muted)]">Tracking Number (optional)</label>
                <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. AB123456789NZ"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]" />
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setConfirmAction(null); setTrackingNumber(""); }} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    await updateStatus(
                      confirmAction.id,
                      confirmAction.status,
                      confirmAction.status === "shipped" ? trackingNumber : undefined
                    );
                    showToast(`Marked as ${confirmAction.label.toLowerCase()}.`, "success");
                    setConfirmAction(null);
                    setTrackingNumber("");
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : "Could not update order. Try again.";
                    if (!msg.includes("Not signed in") && msg !== "Failed to update order") {
                      showToast(msg, "error");
                    }
                  }
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">Confirm</button>
            </div>
          </div>
        </div>
      )}

      <OrderReviewModal
        open={!!reviewModal}
        title="Review Buyer"
        subtitle={
          reviewModal
            ? `${reviewModal.listingTitle} · ${
                reviewModal.buyerName && !isEmailLike(reviewModal.buyerName)
                  ? reviewModal.buyerName
                  : "Buyer"
              }`
            : ""
        }
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
          } catch {
            showToast("Failed to submit review", "error");
          }
          setReviewSending(false);
        }}
      />
    </main>
  );
}
