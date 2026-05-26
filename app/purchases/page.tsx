"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
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
  disputed?: boolean;
  rentalDays?: number;
  rentalStart?: any;
  rentalEnd?: any;
}

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
      if (p.status === "shipped" && p.createdAt?.seconds && (now - p.createdAt.seconds * 1000) > 14 * 86400000) {
        updateStatus(p.id, "delivered").catch(() => {});
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
          type: "order_update",
          title: "Buyer Confirmed Receipt",
          message: `${user!.email} confirmed receipt of "${purchase.listingTitle}".`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
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

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <h1 className="text-2xl font-black text-[var(--foreground)]">My Purchases</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{counts.active || "Track everything you've bought."}</p>

        {/* Search + Sort */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by title or seller..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-sky-500/40"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-[var(--foreground)] outline-none"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price-high">Price ↓</option>
            <option value="price-low">Price ↑</option>
          </select>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-4 overflow-x-auto border-b border-zinc-800 pb-2">
          {[
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "delivered", label: "Delivered" },
            { key: "cancelled", label: "Cancelled" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`text-xs font-bold uppercase tracking-wider transition ${
                filter === tab.key ? "text-sky-400" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`ml-1 text-[10px] ${filter === tab.key ? "text-sky-400" : "text-zinc-600"}`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-8 rounded-xl border border-red-800/40 bg-red-900/20 p-4 text-sm text-red-400">{error}</div>
        )}
          {loading ? (
            <div className="mt-4 space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 rounded-lg bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 rounded bg-zinc-800" />
                      <div className="h-3 w-24 rounded bg-zinc-800" />
                      <div className="h-3 w-32 rounded bg-zinc-800" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
              <svg className="h-6 w-6 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-medium text-[var(--foreground)]">You haven&rsquo;t bought anything yet</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Items you purchase will appear here.</p>
            <Link href="/" className="mt-4 rounded-lg bg-sky-500 px-5 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-sky-400">
              Browse Marketplace
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {filtered.slice(0, visibleCount).map((p) => {
              const dl = deliveryLabel(p);
              const action = nextAction(p);
              const isService = p.deliveryMethod === "service";
              const isRental = p.deliveryMethod === "rental";
              const steps = timelineSteps(isService, isRental);
              const idx = statusIndex(p.status, isService, isRental);
              const hasTimeline = idx >= 0;

              return (
                <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                  {/* Card body */}
                  <div className="flex items-start gap-4 p-5 flex-wrap">
                    {/* Image */}
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                      {p.listingImage ? (
                        <img src={p.listingImage} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-[var(--muted)]">—</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={isService ? "/services" : `/post/listing/${p.listingId}`} className="text-sm font-bold text-[var(--foreground)] transition hover:text-sky-400">
                            {p.listingTitle}
                          </Link>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            ${Number(p.listingPrice).toFixed(2)}
                            {p.createdAt?.seconds && <span> &middot; Bought {formatDate(p.createdAt)}</span>}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                            Seller: <Link href={`/seller/${p.sellerEmail?.split("@")[0] || p.sellerEmail}`} className="text-sky-400 hover:underline">{p.sellerEmail?.split("@")[0] || "—"}</Link>
                          </p>
                        </div>

                        {/* Status pill */}
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLES[p.status] || "bg-zinc-800 text-[var(--muted)]"}`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </span>
                      </div>

                      {/* Delivery method (subtle) */}
                      <div className="mt-2 text-[10px] text-[var(--muted)]">
                        {dl.icon} {dl.text}
                      </div>

                      {/* Order status (prominent) */}
                      <div className="mt-0.5 text-[12px] font-medium">
                        {p.deliveryMethod === "service" && p.status === "in_progress" ? (
                          <span className="text-violet-400">🟣 Service In Progress</span>
                        ) : p.deliveryMethod === "service" && p.status === "delivered" ? (
                          <span className="text-emerald-400">🟢 Service Completed ✓</span>
                        ) : p.deliveryMethod === "rental" && p.status === "rented" ? (
                          <span className="text-emerald-400">🔑 Rental Active</span>
                        ) : p.deliveryMethod === "rental" && p.status === "returned" ? (
                          <span className="text-blue-400">🔁 Item Returned</span>
                        ) : p.deliveryMethod === "rental" && p.status === "completed" ? (
                          <span className="text-emerald-400">✅ Rental Completed</span>
                        ) : p.deliveryMethod === "pickup" ? (
                          <span className="text-sky-400">📍 {p.status === "delivered" ? "Picked Up" : p.status === "cancelled" ? "Cancelled" : "Pickup Arranged"}</span>
                        ) : p.status === "pending" ? (
                          <span className="text-amber-400">🟡 Awaiting Shipment</span>
                        ) : p.status === "seller_confirming" ? (
                          <span className="text-sky-400">🔵 Confirmed</span>
                        ) : p.status === "shipped" ? (
                          <span className="text-sky-400">🔵 Shipped{p.trackingNumber ? ` · ${p.trackingNumber}` : ""}</span>
                        ) : p.status === "delivered" ? (
                          <span className="text-emerald-400">🟢 Delivered ✓</span>
                        ) : p.status === "cancelled" ? (
                          <span className="text-red-400">❌ Cancelled</span>
                        ) : (
                          <span>{STATUS_LABELS[p.status] || p.status}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Order timeline — vertical */}
                  {hasTimeline && (
                    <div className="border-t border-zinc-800/50 px-5 py-4">
                      <div className="relative">
                        {steps.map((step, i) => {
                          const isCompleted = i < idx;
                          const isCurrent = i === idx;
                          return (
                            <div key={step} className="flex items-start gap-3 pb-3 last:pb-0">
                              {/* Dot + line */}
                              <div className="flex flex-col items-center">
                                <div className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                                  isCompleted ? "border-sky-400 bg-sky-400" :
                                  isCurrent ? "border-sky-400 bg-sky-400/20 animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.4)]" :
                                  "border-zinc-700 bg-zinc-900"
                                }`}>
                                  {isCompleted ? (
                                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                    </svg>
                                  ) : isCurrent ? (
                                    <div className="h-2 w-2 rounded-full bg-sky-400" />
                                  ) : null}
                                </div>
                                {i < steps.length - 1 && (
                                  <div className={`h-6 w-0.5 -mt-0.5 transition-colors duration-300 ${
                                    isCompleted ? "bg-sky-400/60" : "bg-zinc-800"
                                  }`} />
                                )}
                              </div>
                              {/* Label */}
                              <div className={`pt-0.5 transition-all duration-300 ${
                                isCompleted ? "text-sky-400" :
                                isCurrent ? "text-[var(--foreground)]" :
                                "text-zinc-600"
                              }`}>
                                <p className="text-xs font-bold">{STATUS_LABELS[step] || step}</p>
                                {isCurrent && (
                                  <p className="text-[10px] text-[var(--muted)] mt-0.5">
                                    {step === "pending" ? isRental ? "Processing rental" : "Awaiting seller confirmation" :
                                     step === "rented" ? "Rental active — return by due date" :
                                     step === "returned" ? "Item returned — completing" :
                                     step === "seller_confirming" ? "Seller is preparing your order" :
                                     step === "shipped" ? "Your item is on the way" :
                                     step === "in_progress" ? "Seller is working on your service" :
                                     step === "delivered" && isService ? "Service completed" :
                                     "Awaiting delivery confirmation"}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions bar */}
                  <div className="flex items-center gap-2 border-t border-zinc-800/50 px-4 py-2.5 flex-wrap">
                    <Link
                      href={isService ? "/services" : `/post/listing/${p.listingId}`}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:border-zinc-600"
                    >
                      View Listing
                    </Link>
                    <Link
                      href={`/messages?user=${encodeURIComponent(p.sellerEmail || "")}&listing=${p.listingId}`}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:border-zinc-600"
                    >
                      Message Seller
                    </Link>
                    {p.deliveryMethod === "digital" && p.digitalFileURL && p.status === "delivered" && (
                      <>
                        <a href={p.digitalFileURL} target="_blank" rel="noopener noreferrer" download={p.digitalFileName}
                          className="rounded-lg bg-sky-500 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:bg-sky-400">
                          📥 Download{p.digitalFileName ? ` ${p.digitalFileName}` : ""}
                        </a>
                        {p.disputeDeadline?.seconds && (Date.now() / 1000) < p.disputeDeadline.seconds && !p.disputed && (
                          <button onClick={async () => {
                            if (!confirm("Report an issue with this digital purchase? Admin will review.")) return;
                            try {
                              await addDoc(collection(db, "reports"), {
                                type: "digital_dispute",
                                purchaseId: p.id,
                                listingId: p.listingId,
                                listingTitle: p.listingTitle,
                                reporterEmail: user?.email || p.buyerEmail,
                                reportedUserEmail: p.sellerEmail,
                                reason: "Digital purchase issue",
                                details: "Buyer reported an issue with a digital download.",
                                createdAt: serverTimestamp(),
                              });
                              showToast("Issue reported. Admin will review.", "success");
                            } catch (e) { console.error(e); }
                          }} className="rounded-lg border border-red-500/30 px-4 py-2 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10">
                            ⚠️ Report Issue
                          </button>
                        )}
                      </>
                    )}
                    {p.deliveryMethod === "service" && p.disputeDeadline?.seconds && (Date.now() / 1000) < p.disputeDeadline.seconds && !p.disputed && (
                      <button onClick={async () => {
                        if (!confirm("Report an issue with this service? Admin will review and may process a refund if the seller is at fault.")) return;
                        try {
                          await addDoc(collection(db, "reports"), {
                            type: "service_dispute",
                            purchaseId: p.id,
                            listingId: p.listingId,
                            listingTitle: p.listingTitle,
                            reporterEmail: user?.email || p.buyerEmail,
                            reportedUserEmail: p.sellerEmail,
                            reason: "Service issue",
                            details: `Buyer reported an issue with service "${p.listingTitle}". Status: ${p.status}`,
                            createdAt: serverTimestamp(),
                          });
                          showToast("Issue reported. Admin will review.", "success");
                        } catch (e) { console.error(e); }
                      }} className="rounded-lg border border-red-500/30 px-4 py-2 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10">
                        ⚠️ Report Issue
                      </button>
                    )}
                    {p.deliveryMethod === "shipping" && !["delivered", "cancelled"].includes(p.status) && (
                      <button
                        onClick={() => { setEditAddress(p); setNewAddress(p.shippingAddress || ""); }}
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:border-zinc-600"
                      >
                        Edit Address
                      </button>
                    )}
                    {p.status === "delivered" && (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => { setReviewModal(p); setReviewRating(0); setReviewText(""); }}
                          className="rounded-lg border border-amber-500/30 px-4 py-2 text-[11px] font-bold text-amber-400 transition hover:bg-amber-500/10"
                        >
                          Leave Review
                        </button>
                        <Link
                          href={isService ? "/services" : `/post/listing/${p.listingId}`}
                          className="rounded-lg border border-sky-500/30 px-4 py-2 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/10"
                        >
                          Buy Again
                        </Link>
                      </div>
                    )}
                    {action && (
                      <button
                        onClick={() => updateStatus(p.id, action.action, (action as any).badge)}
                        className={`ml-auto rounded-lg ${action.color} px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:brightness-110`}
                      >
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {visibleCount < filtered.length && (
              <div className="flex justify-center pt-2">
                <button onClick={() => setVisibleCount(prev => prev + 10)} className="rounded-lg border border-zinc-700 px-5 py-2 text-xs font-bold text-[var(--muted)] transition hover:border-zinc-600 hover:text-[var(--foreground)]">
                  Load More ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}

            {/* Review Modal */}
            {reviewModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setReviewModal(null)}>
                <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-black text-[var(--foreground)]">Leave a Review</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">{reviewModal.listingTitle}</p>

                  {/* Stars */}
                  <div className="mt-4 flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setReviewRating(star)}
                        className={`text-2xl transition ${star <= reviewRating ? "text-amber-400" : "text-zinc-700"}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <textarea
                    placeholder="Share your experience..."
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={3}
                    className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]"
                  />

                  <div className="mt-4 flex gap-3">
                    <button onClick={() => setReviewModal(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
                    <button
                      disabled={!reviewRating || reviewSending}
                      onClick={async () => {
                        setReviewSending(true);
                        try {
                          await addDoc(collection(db, "reviews"), {
                            sellerEmail: reviewModal.sellerEmail,
                            buyerEmail: user?.email,
                            listingId: reviewModal.listingId,
                            listingTitle: reviewModal.listingTitle,
                            rating: reviewRating,
                            reviewText: reviewText.trim(),
                            createdAt: serverTimestamp(),
                          });
                          setReviewModal(null);
                          setReviewRating(0);
                          setReviewText("");
                        } catch (e) { console.error(e); }
                        setReviewSending(false);
                      }}
                      className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
                    >
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
            <h3 className="text-lg font-black text-[var(--foreground)]">Update Shipping Address</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{editAddress.listingTitle}</p>
            <input type="text" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="New shipping address"
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-[var(--muted)]" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setEditAddress(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={saveAddress} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
