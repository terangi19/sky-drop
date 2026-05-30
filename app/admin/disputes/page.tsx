"use client";

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import { showToast } from "../../components/Toast";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import {
  User,
} from "firebase/auth";
import {
  auth,
  db,
  onAuthStateChanged,
} from "../../lib/firebase";

const ADMIN_EMAILS = ["rangitr16@gmail.com"];

const DISPUTE_REASON_LABELS: Record<string, string> = {
  not_received: "Not Received",
  not_as_described: "Not As Described",
  damaged: "Damaged/Defective",
  wrong_item: "Wrong Item",
  digital_issue: "Digital Issue",
  service_issue: "Service Issue",
  other: "Other",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  under_review: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved_buyer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  resolved_seller: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  refunded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function AdminDisputesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "disputes"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setDisputes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Failed to load disputes:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  async function handleReview(disputeId: string) {
    setActionLoading(disputeId);
    try {
      await updateDoc(doc(db, "disputes", disputeId), {
        status: "under_review",
        updatedAt: Timestamp.now(),
      });
      await updateDoc(doc(db, "purchases", disputes.find(d => d.id === disputeId)?.purchaseId), {
        disputeStatus: "under_review",
      });
    } catch (e) { console.error(e); }
    setActionLoading(null);
  }

  async function handleResolveSeller(disputeId: string, purchaseId: string) {
    setActionLoading(disputeId);
    try {
      await updateDoc(doc(db, "disputes", disputeId), {
        status: "resolved_seller",
        adminNotes: adminNotes[disputeId] || "Resolved in seller's favor",
        resolvedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await updateDoc(doc(db, "purchases", purchaseId), {
        disputeStatus: "resolved_seller",
      });
      setAdminNotes((prev) => { const n = { ...prev }; delete n[disputeId]; return n; });
    } catch (e) { console.error(e); }
    setActionLoading(null);
  }

  async function handleRefund(dispute: any) {
    setActionLoading(dispute.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          action: "refund",
          purchaseId: dispute.purchaseId,
          stripePaymentIntentId: dispute.stripePaymentIntentId,
          amount: Number(dispute.listingPrice),
          reason: `Dispute: ${dispute.reason}`,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast("Refund failed: " + (data.error || "Unknown error"), "error");
        setActionLoading(null);
        return;
      }

      await updateDoc(doc(db, "disputes", dispute.id), {
        status: "refunded",
        refundAmount: Number(dispute.listingPrice),
        stripeRefundId: data.refundId,
        adminNotes: adminNotes[dispute.id] || "Refund issued to buyer",
        resolvedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await updateDoc(doc(db, "purchases", dispute.purchaseId), {
        disputeStatus: "refunded",
        status: "cancelled",
      });
      setRefundModal(null);
      setAdminNotes((prev) => { const n = { ...prev }; delete n[dispute.id]; return n; });
    } catch (e) {
      console.error(e);
      showToast("Refund processing failed.", "error");
    }
    setActionLoading(null);
  }

  if (!isAdmin) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar /><ThemeToggle />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="max-w-xl rounded-[40px] border border-red-500/20 bg-[var(--card)] p-12 text-center shadow-2xl backdrop-blur-xl">
            <div className="mb-6 text-7xl">🔒</div>
            <h1 className="text-5xl font-black text-red-500">Access Denied</h1>
            <p className="mt-6 text-lg leading-8 text-[var(--muted)]">You do not have permission to access this page.</p>
          </div>
        </section>
      </main>
    );
  }

  const openDisputes = disputes.filter((d) => d.status === "open" || d.status === "under_review");
  const closedDisputes = disputes.filter((d) => d.status === "resolved_buyer" || d.status === "resolved_seller" || d.status === "refunded");

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-red-500">Dispute Management</h1>
          <p className="mt-2 text-[var(--muted)]">Review and resolve buyer disputes. Refunds are processed via Stripe.</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-red-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Open</p>
            <p className="mt-1 text-3xl font-black text-red-400">{disputes.filter(d => d.status === "open").length}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Under Review</p>
            <p className="mt-1 text-3xl font-black text-amber-400">{disputes.filter(d => d.status === "under_review").length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Refunded</p>
            <p className="mt-1 text-3xl font-black text-emerald-400">{disputes.filter(d => d.status === "refunded").length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Total</p>
            <p className="mt-1 text-3xl font-black text-[var(--foreground)]">{disputes.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-800 bg-[var(--card)] p-10 text-center">Loading disputes...</div>
        ) : disputes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-[var(--card)] p-10 text-center">
            <p className="text-3xl mb-3">🛡️</p>
            <p className="text-lg font-bold">No disputes</p>
            <p className="text-sm text-[var(--muted)] mt-1">All transactions are running smoothly.</p>
          </div>
        ) : (
          <>
            {/* Open Disputes */}
            {openDisputes.length > 0 && (
              <div className="mb-10">
                <h2 className="text-2xl font-black mb-4">Open ({openDisputes.length})</h2>
                <div className="space-y-4">
                  {openDisputes.map((d) => (
                    <div key={d.id} className="rounded-2xl border border-red-500/20 bg-[var(--card)] p-6 shadow-xl">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLES[d.status]}`}>
                              {d.status === "open" ? "Open" : "Reviewing"}
                            </span>
                            <span className="text-lg font-bold text-[var(--foreground)]">{d.listingTitle}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                            <span>Buyer: <span className="font-bold text-[var(--foreground)]">{d.buyerEmail}</span></span>
                            <span>Seller: <span className="font-bold text-[var(--foreground)]">{d.sellerEmail}</span></span>
                            <span>Amount: <span className="font-bold text-emerald-400">${Number(d.listingPrice).toFixed(2)}</span></span>
                            <span>Reason: <span className="font-bold text-red-400">{DISPUTE_REASON_LABELS[d.reason] || d.reason}</span></span>
                            {d.createdAt?.toDate && (
                              <span>{d.createdAt.toDate().toLocaleDateString()}</span>
                            )}
                          </div>
                          <p className="mt-3 text-sm text-[var(--foreground)] bg-zinc-800/30 rounded-xl p-3">{d.description}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {d.status === "open" && (
                          <button onClick={() => handleReview(d.id)} disabled={actionLoading === d.id}
                            className="rounded-xl bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-400 transition hover:bg-amber-500/25 disabled:opacity-50">
                            {actionLoading === d.id ? "..." : "Mark Under Review"}
                          </button>
                        )}
                        <button onClick={() => handleResolveSeller(d.id, d.purchaseId)} disabled={actionLoading === d.id}
                          className="rounded-xl bg-zinc-700/50 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition hover:bg-zinc-600/50 disabled:opacity-50">
                          Resolve in Seller's Favor
                        </button>
                        <button onClick={() => { setRefundModal(d); }}
                          className="rounded-xl bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/25">
                          Issue Refund
                        </button>
                      </div>
                      <textarea value={adminNotes[d.id] || ""} onChange={(e) => setAdminNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                        placeholder="Admin notes (optional)..." rows={2}
                        className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs text-[var(--foreground)] outline-none transition focus:border-red-500 placeholder:text-zinc-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closed Disputes */}
            {closedDisputes.length > 0 && (
              <div>
                <h2 className="text-2xl font-black mb-4">Resolved ({closedDisputes.length})</h2>
                <div className="space-y-3">
                  {closedDisputes.map((d) => (
                    <div key={d.id} className="rounded-2xl border border-zinc-700/30 bg-[var(--card)] p-5 shadow-xl opacity-70">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLES[d.status] || "bg-zinc-800/50 text-zinc-500"}`}>
                            {d.status === "refunded" ? "✅ Refunded" : d.status === "resolved_buyer" ? "Buyer Won" : "Seller Won"}
                          </span>
                          <span className="text-sm font-bold text-[var(--foreground)]">{d.listingTitle}</span>
                          <span className="text-xs text-[var(--muted)]">({d.buyerEmail})</span>
                        </div>
                        {d.adminNotes && <span className="text-xs text-zinc-500">{d.adminNotes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Refund confirmation modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setRefundModal(null)}>
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-[var(--foreground)]">Confirm Refund</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">This will refund <strong>${Number(refundModal.listingPrice).toFixed(2)}</strong> to the buyer via Stripe.</p>
            <p className="mt-2 text-xs text-red-400">The purchase will be cancelled and seller will be notified.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setRefundModal(null)} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-zinc-700 active:scale-[0.97] transition-all">Cancel</button>
              <button onClick={() => handleRefund(refundModal)} disabled={actionLoading === refundModal.id}
                className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50">
                {actionLoading === refundModal.id ? "Processing..." : `Refund $${Number(refundModal.listingPrice).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
