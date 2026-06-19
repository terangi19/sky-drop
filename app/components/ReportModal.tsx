"use client";

import { useState } from "react";
import { REPORT_REASONS } from "../lib/report-constants";
import { submitReportRequest } from "../lib/submit-report.client";
import { showToast } from "./Toast";
import TurnstileWidget from "./TurnstileWidget";
import { getTurnstileSiteKey } from "../lib/turnstile";

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
}: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  if (!isOpen) return null;

  async function handleSubmit() {
    if (!reason) return;

    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to submit a report.", "error");
      return;
    }

    const cooldownKey = `report_cooldown_${type}_${targetId || targetUserEmail}`;
    try {
      const lastReport = localStorage.getItem(cooldownKey);
      if (lastReport) {
        const elapsed = Date.now() - Number(lastReport);
        if (elapsed < 10 * 60 * 1000) {
          showToast("Please wait a few minutes before reporting again.", "info");
          return;
        }
      }
    } catch (e) {
      console.error("Failed to read report cooldown:", e);
    }

    setSending(true);
    try {
      await submitReportRequest({
        type,
        listingId: type === "listing" ? targetId : undefined,
        reportedUserId: targetUserId,
        reportedUserEmail: targetUserEmail,
        reason,
        details: message,
        turnstileToken,
      });

      try {
        localStorage.setItem(cooldownKey, String(Date.now()));
      } catch (e) {
        console.error("Failed to save report cooldown:", e);
      }
      setSent(true);
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Failed to submit report.", "error");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/20">
              <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
                <label key={r} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${reason === r ? "border-sky-500/50 bg-sky-500/10" : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-sky-500" />
                  <span className="text-sm font-medium text-[var(--foreground)]">{r}</span>
                </label>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: add more details..."
              rows={3}
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500"
            />
            <TurnstileWidget
              onToken={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken("")}
              className="mt-4 flex justify-center scale-[0.85] origin-center"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-zinc-700 active:scale-[0.98]">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason || sending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] transition-all duration-150 hover:bg-sky-400 disabled:opacity-50 active:scale-[0.98]"
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
