"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { User } from "firebase/auth";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { createNotification } from "../lib/notifications";
import { awardXP } from "../lib/xp";
import { showToast } from "../components/Toast";

interface Purchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  sellerEmail: string;
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
  trackingNumber?: string;
  estimatedDays?: number;
  type?: string;
  digitalFileURL?: string;
  digitalFileName?: string;
  disputeDeadline?: any;
  disputeStatus?: string;
  stripePaymentIntentId?: string;
  rentalDays?: number;
  rentalStart?: any;
  rentalEnd?: any;
}

const DISPUTE_LABELS: Record<string, string> = {
  open: "Dispute Open",
  under_review: "Under Review",
  resolved_buyer: "Resolved — You Won",
  resolved_seller: "Resolved — Seller",
  refunded: "Refunded",
};

const DISPUTE_STYLES: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  under_review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved_buyer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  resolved_seller: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  refunded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  seller_confirming: "Confirmed",
  in_progress: "In Progress",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rented: "Rented",
  returned: "Returned",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  seller_confirming: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_progress: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  shipped: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  rented: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  returned: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const TIMELINE_STEPS = ["pending", "seller_confirming", "shipped", "delivered"];
const SERVICE_TIMELINE_STEPS = ["pending", "in_progress", "delivered"];
const RENTAL_TIMELINE_STEPS = ["pending", "rented", "returned", "completed"];

function formatDate(ts: any): string {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function statusIndex(s: string, isService?: boolean, isRental?: boolean): number {
  const steps = isRental ? RENTAL_TIMELINE_STEPS : isService ? SERVICE_TIMELINE_STEPS : TIMELINE_STEPS;
  const i = steps.indexOf(s);
  return i >= 0 ? i : -1;
}

function timelineSteps(isService?: boolean, isRental?: boolean): string[] {
  return isRental ? RENTAL_TIMELINE_STEPS : isService ? SERVICE_TIMELINE_STEPS : TIMELINE_STEPS;
}

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
    const q = query(collection(db, "purchases"), where("buyerEmail", "==", user.email));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setPurchases(items);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load purchases:", err);
      setError("Could not load purchases. Check your connection.");
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

  // Auto-confirm shipped items after 14 days
  useEffect(() => {
    const now = Date.now();
    for (const p of purchases) {
      if (p.status === "shipped" && !p.disputeStatus && p.createdAt?.seconds && (now - p.createdAt.seconds * 1000) > 14 * 86400000) {
        updateStatus(p.id, "delivered").catch((e) => console.error("Failed to auto-confirm delivery:", e));
      }
    }
  }, [purchases]);

  async function updateStatus(id: string, status: string, badge?: string) {
    try {
      await updateDoc(doc(db, "purchases", id), { status, deliveredAt: serverTimestamp() });

      const purchase = purchases.find((p) => p.id === id);
      if (purchase && status === "delivered") {
        await awardXP(user!.uid, 25);
        await createNotification({
          targetEmail: purchase.sellerEmail,
          fromEmail: user!.email!,
          type: "delivered",
          title: "Buyer Confirmed Receipt",
          message: `${user!.email} confirmed receipt of "${purchase.listingTitle}". Funds will be released after a short verification.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
          total: purchase.total,
        });

        // Attempt to release funds from escrow
        try {
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch("/api/release-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
            body: JSON.stringify({ purchaseId: id }),
          });
          const data = await res.json();
          if (data.success) {
            await createNotification({
              targetEmail: purchase.buyerEmail,
              fromEmail: user!.email!,
              type: "payment_released",
              title: "Transaction Complete",
              message: `Payment for "${purchase.listingTitle}" has been released to the seller. Transaction complete! Thanks for using Sky Drop.`,
              listingId: purchase.listingId,
              listingTitle: purchase.listingTitle,
              listingImage: purchase.listingImage,
              total: purchase.total,
            });
            showToast("Funds released to seller!", "success");
          } else {
            showToast(data.error || "Funds will be released once verified.", "info");
          }
        } catch (e) {
          console.error("Release payment error:", e);
          showToast("Could not release funds immediately. Auto-release pending.", "info");
        }

        setReviewModal(purchase);
      }
    } catch (e) {
      console.error("Failed to update:", e);
    }
  }

  async function saveAddress() {
    if (!editAddress || !newAddress.trim()) return;
    try {
      await updateDoc(doc(db, "purchases", editAddress.id), { shippingAddress: newAddress.trim() });
      setEditAddress(null);
      setNewAddress("");
    } catch (e) { console.error("Failed to update address:", e); }
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

  function nextAction(p: Purchase): { label: string; action: string; color: string; badge?: string } | null {
    if (p.status === "shipped") return { label: "Confirm Received", action: "delivered", color: "bg-emerald-500" };
    if (p.deliveryMethod === "service" && p.status === "in_progress") return { label: "Mark Completed", action: "delivered", color: "bg-violet-500" };
    if (p.deliveryMethod === "rental" && p.status === "rented") return { label: "Return Item", action: "returned", color: "bg-sky-500" };
    return null;
  }

  function deliveryLabel(p: Purchase): { icon: string; text: string; badge: string } {
    if (p.deliveryMethod === "pickup") return { icon: "📍", text: p.pickupArea ? `Pickup — ${p.pickupArea}` : "Local Pickup", badge: "Pickup" };
    if (p.freeShipping) return { icon: "🚚", text: "Free Shipping", badge: "Free Shipping" };
    if (p.deliveryMethod === "digital") return { icon: "📥", text: "Digital Download", badge: "Digital" };
    if (p.deliveryMethod === "service") return { icon: "🤝", text: "Service", badge: "Service" };
    if (p.deliveryMethod === "rental") return { icon: "🔑", text: p.rentalDays ? `Rental — ${p.rentalDays} day(s)` : "Rental", badge: "Rental" };
    return { icon: "📦", text: p.shippingFee ? `Shipping — $${p.shippingFee}` : "Shipping", badge: "Shipping" };
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">

        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4 sm:mb-5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="relative mb-8">
          <div className="absolute -inset-20 bg-gradient-to-r from-emerald-500/5 via-sky-500/5 to-transparent blur-3xl pointer-events-none" />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-white drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">My Purchases</span>
          </h1>
          <p className="relative mt-3 text-sm text-zinc-400 leading-relaxed max-w-xl">Every purchase on Sky Drop is protected by our escrow system. Your payment is held securely until you confirm delivery — ensuring you never pay for something you haven't received. Track your orders, manage delivery, and shop with complete peace of mind.</p>
          <p className="relative mt-2 text-sm text-zinc-500">{purchases.length} total · {counts.active || 0} active</p>
        </div>

        {/* Search + filter chips */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input type="text" placeholder="Search purchases..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-emerald-500/10" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "delivered", label: "Delivered" },
              { key: "cancelled", label: "Cancelled" },
            ].map((tab) => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                  filter === tab.key ? "bg-gradient-to-b from-emerald-500/20 to-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.06)]" : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {tab.label}{counts[tab.key] > 0 ? ` (${counts[tab.key]})` : ""}
              </button>
            ))}
          </div>
        </div>

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
                    <div className="h-3 w-32 rounded bg-white/[0.03]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">Nothing here yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Items you buy will show up here.</p>
            <Link href="/" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.97]">
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, visibleCount).map((p) => {
              const dl = deliveryLabel(p);
              const action = nextAction(p);
              return (
                <div key={p.id} className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:bg-white/[0.04]">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <Link href={`/post/listing/${p.listingId}`} className="shrink-0">
                      <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.06]">
                        {p.listingImage ? (
                          <img src={p.listingImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">—</div>
                        )}
                      </div>
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/post/listing/${p.listingId}`} className="text-sm font-bold text-[var(--foreground)] transition hover:text-emerald-400 line-clamp-1">{p.listingTitle}</Link>
                          <p className="mt-0.5 text-sm font-semibold text-emerald-400">${Number(p.listingPrice).toFixed(2)}</p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                            <Link href={`/seller/${p.sellerEmail}`} className="hover:text-emerald-400 transition-colors">{p.sellerEmail?.split("@")[0] || "—"}</Link>
                            {p.createdAt?.seconds && <span>· {formatDate(p.createdAt)}</span>}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-3 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status] || "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                        <span>{dl.icon} {dl.text}</span>
                        {p.status === "shipped" && p.trackingNumber && <span className="text-zinc-600">· #{p.trackingNumber}</span>}
                      </div>

                      {/* Dispute status */}
                      {p.disputeStatus && p.disputeStatus !== "resolved_seller" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${DISPUTE_STYLES[p.disputeStatus] || "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                            {p.disputeStatus === "refunded" ? "✅ " : "⚠️ "}{DISPUTE_LABELS[p.disputeStatus] || p.disputeStatus}
                          </span>
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <Link href={`/messages?user=${encodeURIComponent(p.sellerEmail || "")}&listing=${p.listingId}`}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-300 active:scale-[0.97]">
                          Message
                        </Link>
                        {p.deliveryMethod === "digital" && p.digitalFileURL && p.status === "delivered" && (
                          <a href={p.digitalFileURL} target="_blank" rel="noopener noreferrer" download={p.digitalFileName}
                            className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                            📥 Download
                          </a>
                        )}
                        {p.status === "delivered" && !p.disputeStatus && (
                          <button onClick={() => { setReviewModal(p); setReviewRating(0); setReviewText(""); }}
                            className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[11px] font-bold text-amber-400 transition hover:bg-amber-500/10 active:scale-[0.97]">
                            Review
                          </button>
                        )}
                        {p.deliveryMethod === "shipping" && !["delivered", "cancelled"].includes(p.status) && (
                          <button onClick={() => { setEditAddress(p); setNewAddress(p.shippingAddress || ""); }}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] active:scale-[0.97]">
                            Edit Address
                          </button>
                        )}
                        {["delivered", "shipped", "seller_confirming"].includes(p.status) && !p.disputeStatus && (
                          <button onClick={() => { setDisputeModal(p); setDisputeReason(""); setDisputeDescription(""); }}
                            className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 active:scale-[0.97]">
                            ⚠️ Dispute
                          </button>
                        )}
                        {action && !p.disputeStatus && (
                          <button onClick={() => updateStatus(p.id, action.action, (action as any).badge)}
                            className={`rounded-lg ${action.color} px-3 py-1.5 text-[11px] font-bold text-white shadow-lg transition hover:brightness-110 active:scale-[0.97]`}>
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
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 text-xs font-bold text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-300 active:scale-[0.97]">
                  Load More ({filtered.length - visibleCount})
                </button>
              </div>
            )}

            {/* Review Modal */}
            {reviewModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setReviewModal(null)}>
                <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-black text-[var(--foreground)]">Leave a Review</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{reviewModal.listingTitle}</p>
                  <div className="mt-4 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setReviewRating(star)}
                        className={`text-2xl transition ${star <= reviewRating ? "text-amber-400" : "text-zinc-700"}`}>★</button>
                    ))}
                  </div>
                  <textarea placeholder="Share your experience..." value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                    rows={3} className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-emerald-500 placeholder:text-[var(--muted)]" />
                  <div className="mt-4 flex gap-3">
                    <button onClick={() => setReviewModal(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
                    <button disabled={!reviewRating || reviewSending} onClick={async () => {
                      setReviewSending(true);
                      try {
                        await addDoc(collection(db, "reviews"), { sellerEmail: reviewModal.sellerEmail, buyerEmail: user?.email, listingId: reviewModal.listingId, listingTitle: reviewModal.listingTitle, rating: reviewRating, reviewText: reviewText.trim(), createdAt: serverTimestamp() });
                        setReviewModal(null); setReviewRating(0); setReviewText("");
                      } catch (e) { console.error(e); }
                      setReviewSending(false);
                    }} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50">
                      {reviewSending ? "Sending..." : "Submit Review"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {editAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditAddress(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Update Address</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{editAddress.listingTitle}</p>
            <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="New shipping address"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-emerald-500 placeholder:text-[var(--muted)]" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setEditAddress(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={saveAddress} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl active:scale-[0.97]">Save</button>
            </div>
          </div>
        </div>
      )}

      {disputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDisputeModal(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Open a Dispute</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{disputeModal.listingTitle}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-500 mb-1 block">Reason</label>
                <select value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-red-500">
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
                <label className="text-xs font-bold text-zinc-500 mb-1 block">Describe the issue</label>
                <textarea value={disputeDescription} onChange={(e) => setDisputeDescription(e.target.value)}
                  rows={4} className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-red-500 placeholder:text-zinc-600"
                  placeholder="Explain what happened in detail..." />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setDisputeModal(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button disabled={!disputeReason || !disputeDescription.trim() || disputeSending} onClick={async () => {
                setDisputeSending(true);
                try {
                  const disputeRef = await addDoc(collection(db, "disputes"), {
                    purchaseId: disputeModal.id,
                    listingId: disputeModal.listingId,
                    listingTitle: disputeModal.listingTitle,
                    listingPrice: disputeModal.listingPrice,
                    buyerEmail: user?.email,
                    sellerEmail: disputeModal.sellerEmail,
                    reason: disputeReason,
                    description: disputeDescription.trim(),
                    status: "open",
                    stripePaymentIntentId: disputeModal.stripePaymentIntentId || "",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  await updateDoc(doc(db, "purchases", disputeModal.id), { disputeStatus: "open" });
                  await createNotification({
                    targetEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL || "rangitr16@gmail.com",
                    fromEmail: user!.email!,
                    type: "dispute_opened",
                    title: "New Dispute Opened",
                    message: `Dispute opened for "${disputeModal.listingTitle}" — ${disputeReason}`,
                    listingId: disputeModal.listingId,
                    listingTitle: disputeModal.listingTitle,
                  });
                  setDisputeModal(null);
                  showToast("Dispute opened. Admin will review shortly.");
                } catch (e) {
                  console.error(e);
                  showToast("Failed to open dispute. Try again.", "error");
                }
                setDisputeSending(false);
              }} className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50">
                {disputeSending ? "Opening..." : "Open Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
