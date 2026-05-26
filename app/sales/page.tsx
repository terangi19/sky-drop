"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
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
  deliveryMethod: string;
  shippingAddress?: string;
  shippingFee: number;
  total: number;
  status: string;
  paidAt?: any;
  createdAt?: any;
  badgeTransfer?: string;
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

const nextStatus: Record<string, { label: string; status: string }> = {
  pending: { label: "Confirm Order", status: "seller_confirming" },
  seller_confirming: { label: "Shipped", status: "shipped" },
  in_progress: { label: "Mark Delivered", status: "delivered" },
  rented: { label: "Mark Returned", status: "returned" },
  returned: { label: "Complete", status: "completed" },
};

export default function SalesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [sales, setSales] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

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

  async function updateStatus(purchaseId: string, newStatus: string) {
    try {
      await updateDoc(doc(db, "purchases", purchaseId), { status: newStatus });

      const purchase = sales.find((s) => s.id === purchaseId);
      if (!purchase) return;

      if (newStatus === "seller_confirming") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "order_update",
          title: "Order Confirmed",
          message: `Your order for "${purchase.listingTitle}" has been confirmed by the seller.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });
      }

      if (newStatus === "shipped") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "order_update",
          title: "Item Shipped",
          message: `Your item "${purchase.listingTitle}" has been shipped and is on its way!`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });

        // Release funds to seller
        try {
          const profileSnap = await getDoc(doc(db, "profiles", user!.uid));
          const accountId = profileSnap.data()?.stripeAccountId;
          if (accountId && purchase.total) {
            await fetch("/api/stripe-connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "withdraw", accountId, amount: purchase.total }),
            });
          }
        } catch (e) { console.error("Payout transfer failed:", e); }
      }

      if (newStatus === "delivered" && purchase.deliveryMethod === "service") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "order_update",
          title: "Service Completed",
          message: `Your service "${purchase.listingTitle}" has been marked as delivered by the seller. Please confirm you're satisfied.`,
          listingId: purchase.listingId,
          listingTitle: purchase.listingTitle,
          listingImage: purchase.listingImage,
        });

        // Release funds to seller on service delivery
        try {
          const profileSnap = await getDoc(doc(db, "profiles", user!.uid));
          const accountId = profileSnap.data()?.stripeAccountId;
          if (accountId && purchase.total) {
            await fetch("/api/stripe-connect", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "withdraw", accountId, amount: purchase.total }),
            });
          }
        } catch (e) { console.error("Service payout transfer failed:", e); }
      }

      if (newStatus === "returned" && purchase.deliveryMethod === "rental") {
        await createNotification({
          targetEmail: purchase.buyerEmail,
          fromEmail: user!.email!,
          type: "order_update",
          title: "Item Returned",
          message: `The seller confirmed return of "${purchase.listingTitle}". Rental completed!`,
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

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-10">
<Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
        <h1 className="text-2xl font-black text-[var(--foreground)]">Sales</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Items you&rsquo;ve sold.</p>

        {error && (
          <div className="mt-8 rounded-xl border border-red-800/40 bg-red-900/20 p-4 text-sm text-red-400">{error}</div>
        )}
        {loading ? (
          <div className="mt-6 space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 animate-pulse">
                <div className="h-16 w-16 rounded-lg bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-zinc-800" />
                  <div className="h-3 w-32 rounded bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : sales.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-[var(--muted)]">No sales yet.</p>
            <Link href="/post/ai" className="mt-2 inline-block text-sm text-sky-400 hover:underline">Create a listing</Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center gap-4 flex-wrap rounded-xl border border-white/[0.04] bg-white/[0.02] p-5">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                  {s.listingImage ? (
                    <img src={s.listingImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--muted)]">No img</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <Link href={s.deliveryMethod === "service" ? "/services" : `/post/listing/${s.listingId}`} className="truncate text-sm font-bold text-[var(--foreground)] hover:text-sky-400 transition-colors">
                    {s.listingTitle}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    ${s.listingPrice} &middot; {s.buyerName} &middot; {s.deliveryMethod === "pickup" ? "Pickup" : s.deliveryMethod === "shipping" ? "Shipping" : s.deliveryMethod === "service" ? "Service" : "Digital"}
                  </p>
                  {s.deliveryMethod === "shipping" && s.shippingAddress && (
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">Ship to: {s.shippingAddress}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusStyles[s.status] || "bg-zinc-800 text-[var(--muted)]"}`}>
                      {s.status === "seller_confirming" ? "Confirmed" : s.status === "shipped" ? "Shipped" : s.status === "in_progress" ? "In Progress" : s.status === "delivered" ? "Delivered" : s.status}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">${s.total.toFixed(2)}</span>
                    {s.buyerPhone && (
                      <span className="text-[10px] text-[var(--muted)]">&middot; {s.buyerPhone}</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  {nextStatus[s.status] ? (
                    <button
                      onClick={() => setConfirmAction({ id: s.id, status: nextStatus[s.status].status, label: nextStatus[s.status].label })}
                      className="rounded-xl bg-sky-500 px-4 py-2 text-[11px] font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                    >
                      {nextStatus[s.status].label}
                    </button>
                  ) : null}
                  <Link
                    href={`/messages?user=${encodeURIComponent(s.buyerEmail || "")}&listing=${s.listingId}`}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-[11px] text-[var(--foreground)] transition hover:border-zinc-600 text-center"
                  >
                    Message
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Mark as {confirmAction.label}?</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">This will update the order status.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700">Cancel</button>
              <button onClick={async () => { await updateStatus(confirmAction.id, confirmAction.status); setConfirmAction(null); }} className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
