"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const DISPUTE_LABELS: Record<string, string> = {
  open: "Open",
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

const REASON_LABELS: Record<string, string> = {
  not_received: "Not Received",
  not_as_described: "Not As Described",
  damaged: "Damaged",
  wrong_item: "Wrong Item",
  digital_issue: "Digital Issue",
  service_issue: "Service Issue",
  other: "Other",
};

export default function DisputesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(
      collection(db, "disputes"),
      where("buyerEmail", "==", user.email),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setDisputes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Failed to load disputes:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.email]);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4 sm:mb-5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <div className="relative mb-8">
          <div className="absolute -inset-20 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent blur-3xl pointer-events-none" />
          <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-white via-red-100 to-white bg-clip-text text-transparent">My Disputes</span>
          </h1>
          <p className="relative mt-2 text-sm text-zinc-500">{disputes.length} total</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2].map((i) => (
              <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.04] p-5 animate-pulse">
                <div className="h-4 w-40 rounded bg-white/[0.03]" />
                <div className="mt-2 h-3 w-20 rounded bg-white/[0.03]" />
              </div>
            ))}
          </div>
        ) : disputes.length === 0 ? (
          <div className="mx-auto max-w-md mt-16 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <svg className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No disputes</h2>
            <p className="mt-2 text-sm text-zinc-500">If you have an issue with a purchase, go to your purchases page to open a dispute.</p>
            <Link href="/purchases" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-red-500/30 active:scale-[0.97]">
              View Purchases
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {disputes.map((d) => (
              <div key={d.id} className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 sm:p-5 transition-all duration-200 hover:bg-white/[0.04]">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--foreground)] line-clamp-1">{d.listingTitle}</p>
                        <p className="mt-0.5 text-sm font-semibold text-emerald-400">${Number(d.listingPrice).toFixed(2)}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span>Seller: {d.sellerEmail?.split("@")[0]}</span>
                          <span>· {REASON_LABELS[d.reason] || d.reason}</span>
                          {d.createdAt?.toDate && <span>· {d.createdAt.toDate().toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-0.5 text-[10px] font-bold ${DISPUTE_STYLES[d.status] || "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"}`}>
                        {d.status === "refunded" ? "✅ " : d.status === "resolved_buyer" ? "✅ " : "⚠️ "}{DISPUTE_LABELS[d.status] || d.status}
                      </span>
                    </div>

                    {d.description && (
                      <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{d.description}</p>
                    )}

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Link href={`/messages?user=${encodeURIComponent(d.sellerEmail || "")}&listing=${d.listingId}`}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-300 active:scale-[0.97]">
                        Message Seller
                      </Link>
                      <Link href={`/post/listing/${d.listingId}`}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-300 active:scale-[0.97]">
                        View Listing
                      </Link>
                      {d.adminNotes && (
                        <span className="text-[11px] text-zinc-600">Admin: {d.adminNotes}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
