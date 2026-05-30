"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
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
  deliveryMethod: string;
  shippingAddress?: string;
  shippingFee: number;
  total: number;
  status: string;
  paidAt?: any;
  createdAt?: any;
  badgeTransfer?: string;
  disputeStatus?: string;
}

const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  seller_confirming: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  shipped: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  in_progress: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  rented: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  returned: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function formatDate(ts: any): string {
  if (!ts) return "";
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  return new Date(ts).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    seller_confirming: "Confirmed",
    shipped: "Shipped",
    in_progress: "In Progress",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    rented: "Rented",
    returned: "Returned",
  };
  return labels[status] || status;
}

const nextStatus: Record<string, { label: string; status: string }> = {
  pending: { label: "Confirm Order", status: "seller_confirming" },
  seller_confirming: { label: "Shipped", status: "shipped" },
  in_progress: { label: "Mark Completed", status: "completed" },
  rented: { label: "Mark Returned", status: "returned" },
  returned: { label: "Complete", status: "completed" },
};

export default function SalesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);
  const [sellerStripeId, setSellerStripeId] = useState("");
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
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
    const q = query(collection(db, "purchases"), where("sellerEmail", "==", user.email));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase));
      items.sort((a: any, b: any) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setSales(items);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load sales:", err);
      setError("Could not load sales. Check your connection.");
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

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
    if (filter === "active") items = items.filter((s) => !["completed", "cancelled"].includes(s.status));
    else if (filter !== "all") items = items.filter((s) => s.status === filter);
    return items;
  }, [sales, filter]);

  async function updateStatus(purchaseId: string, newStatus: string) {
    try {
      await updateDoc(doc(db, "purchases", purchaseId), { status: newStatus });

      const purchase = sales.find((s) => s.id === purchaseId);
      if (!purchase) return;

      if (newStatus === "seller_confirming") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "order_confirmed",
          title: "Order Confirmed",
          message: `Your order for "${purchase.listingTitle}" has been confirmed by the seller. They'll prepare your item and update the status when shipped.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "shipped") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "item_shipped",
          title: "Item Shipped",
          message: `Your item "${purchase.listingTitle}" has been shipped and is on its way! Track delivery in your purchases page.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "delivered" && purchase.deliveryMethod !== "service") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "delivered",
          title: "Item Delivered",
          message: `Your purchase "${purchase.listingTitle}" has been marked as delivered. Please confirm receipt to release funds to the seller, or open a dispute within 7 days.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "delivered" && purchase.deliveryMethod === "service") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "service_completed",
          title: "Service Completed",
          message: `Your service "${purchase.listingTitle}" has been marked as complete. Please confirm you're satisfied to release payment.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "returned" && purchase.deliveryMethod === "rental") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "item_returned",
          title: "Item Returned",
          message: `The seller confirmed return of "${purchase.listingTitle}". Rental completed! Thanks for using Sky Drop.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "delivered") {
        await awardXP(user!.uid, 50);
      }
    } catch (e) {
      console.error("Failed to update status:", e);
    }
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
          <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-violet-500/5 to-transparent blur-3xl pointer-events-none" />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
            <span className="text-white drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">Sales</span>
          </h1>
          <p className="relative mt-3 text-sm text-zinc-400 leading-relaxed max-w-xl">Track your sales, manage orders, and get paid — all in one place. When a buyer confirms delivery, release your funds securely through our escrow system. Every transaction is protected from listing to payout.</p>
          <p className="relative mt-2 text-sm text-zinc-500">{filtered.length} of {sales.length} total</p>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto mb-6">
          {[
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "all", label: "All" },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                filter === tab.key ? "bg-gradient-to-b from-indigo-500/20 to-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.06)]" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              {tab.label}{counts[tab.key] > 0 ? ` (${counts[tab.key]})` : ""}
            </button>
          ))}
        </div>

        {!sellerStripeId && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm">
            <p className="font-bold text-amber-400">⚠️ Stripe Not Connected</p>
            <p className="mt-1 text-amber-400/70">Connect Stripe to receive payouts from your sales. <Link href="/profile?tab=payouts" className="text-sky-400 underline hover:text-sky-300">Go to Profile →</Link></p>
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
            <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.97]">
              Create a Listing
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:bg-white/[0.04]">
                <div className="flex items-start gap-3 sm:gap-4">
                  <Link href={`/post/listing/${s.listingId}`} className="shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/[0.06]">
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
                        <Link href={`/post/listing/${s.listingId}`} className="text-sm font-bold text-[var(--foreground)] transition hover:text-indigo-400 line-clamp-1">{s.listingTitle}</Link>
                        <p className="mt-0.5 text-sm font-semibold text-indigo-400">${s.listingPrice}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>{s.buyerName || s.buyerEmail?.split("@")[0] || "—"}</span>
                          <span>· {s.deliveryMethod}</span>
                          {s.createdAt && <span>· {formatDate(s.createdAt)}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-0.5 text-[10px] font-bold ${statusStyles[s.status] || "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"}`}>
                        {statusLabel(s.status)}
                      </span>
                      {s.disputeStatus && (
                        <span className="shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-0.5 text-[10px] font-bold text-red-400">
                          ⚠️ Dispute
                        </span>
                      )}
                    </div>

                    {s.deliveryMethod === "shipping" && s.shippingAddress && (
                      <p className="mt-1.5 text-[11px] text-zinc-600">📍 Ship to: {s.shippingAddress}</p>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {nextStatus[s.status] && !s.disputeStatus && !(s as any).fundsReleased ? (
                        <button onClick={() => setConfirmAction({ id: s.id, status: nextStatus[s.status].status, label: nextStatus[s.status].label })}
                          className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-[11px] font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-xl active:scale-[0.97]">
                          {nextStatus[s.status].label}
                        </button>
                      ) : null}
                      {s.status === "delivered" && !(s as any).fundsReleased && (
                        <span className="text-[11px] text-amber-400 font-bold">🔒 Funds Held in Escrow</span>
                      )}
                      {(s as any).fundsReleased && (
                        <span className="text-[11px] text-emerald-400 font-bold">✅ Funds Released</span>
                      )}
                      <Link href={`/messages?user=${encodeURIComponent(s.buyerEmail || "")}&listing=${s.listingId}`}
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
            ))}
          </div>
        )}
      </section>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-lg font-black text-[var(--foreground)]">Mark as {confirmAction.label}?</h3>
            <p className="mt-2 text-center text-sm text-[var(--muted)]">This will update the order status and notify the buyer.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={async () => { await updateStatus(confirmAction.id, confirmAction.status); setConfirmAction(null); }}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-xl active:scale-[0.97]">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
