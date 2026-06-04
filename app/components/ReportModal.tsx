"use client";

import { useState } from "react";
import { addDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { showToast } from "./Toast";

const REPORT_REASONS = [
  "Scam/fraud",
  "Fake item",
  "Suspicious price",
  "Stolen images",
  "Harassment/abuse",
  "Other",
];

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "listing" | "user";
  targetId: string;
  targetUserId: string;
  targetUserEmail: string;
  reporterUserId: string;
  reporterUserEmail: string;
}

export default function ReportModal({
  isOpen,
  onClose,
  type,
  targetId,
  targetUserId,
  targetUserEmail,
  reporterUserId,
  reporterUserEmail,
}: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!reason) return;

    // Rate limiting: check 24h cooldown
    const cooldownKey = `report_cooldown_${type}_${targetId || targetUserEmail}`;
    let lastReport = null;
    try { lastReport = localStorage.getItem(cooldownKey); } catch (e) { console.error("Failed to read report cooldown:", e); }
    if (lastReport) {
      const elapsed = Date.now() - Number(lastReport);
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - elapsed) / (1000 * 60 * 60));
      if (elapsed < 24 * 60 * 60 * 1000) {
        showToast(`You already reported this ${type}. Please wait ${hoursLeft}h before reporting again.`, "info");
        return;
      }
    }

    setSending(true);
    try {
      // Server-side cooldown: check for recent report from this user for this target
      const cooldownQuery = query(
        collection(db, "reports"),
        where("reporterUserId", "==", reporterUserId),
        where("type", "==", type),
        where(type === "listing" ? "listingId" : "reportedUserEmail", "==", type === "listing" ? targetId : targetUserEmail),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const recentSnap = await getDocs(cooldownQuery);
      if (!recentSnap.empty) {
        const lastReport = recentSnap.docs[0].data();
        const lastTime = lastReport.createdAt?.toMillis?.();
        if (lastTime && Date.now() - lastTime < 10 * 60 * 1000) {
          showToast("Please wait before reporting again.", "info");
          setSending(false);
          return;
        }
      }

      await addDoc(collection(db, "reports"), {
        type,
        listingId: type === "listing" ? targetId : null,
        reportedUserId: targetUserId,
        reportedUserEmail: targetUserEmail,
        reporterUserId,
        reporterUserEmail,
        reason,
        details: message,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      try { localStorage.setItem(cooldownKey, String(Date.now())); } catch (e) { console.error("Failed to save report cooldown:", e); }
      setSent(true);
    } catch (e) {
      console.error(e);
      showToast("Failed to submit report.", "error");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20">
              <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-black text-[var(--foreground)]">Report Submitted</h3>
            <p className="mt-2 text-sm text-[var(--foreground)]">Our moderation team will review this report.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 active:scale-[0.98]">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-[var(--foreground)]">Report {type === "listing" ? "Listing" : "User"}</h3>
              <button onClick={onClose} className="text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">&times;</button>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">Why are you reporting this {type}?</p>
            <div className="mt-4 space-y-2">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${reason === r ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-amber-500" />
                  <span className="text-sm font-medium text-[var(--foreground)]">{r}</span>
                </label>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: add more details..."
              rows={3}
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-amber-500"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 active:scale-[0.98]">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason || sending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-amber-400 disabled:opacity-50 active:scale-[0.98]"
              >
                {sending ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
