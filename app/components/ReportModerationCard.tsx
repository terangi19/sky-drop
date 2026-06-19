"use client";

import Link from "next/link";
import { useState } from "react";
import { auth } from "../lib/firebase";
import { showToast } from "./Toast";

export type ModerationReport = {
  id: string;
  type?: string;
  reason?: string;
  details?: string;
  status?: string;
  createdAtMs?: number | null;
  reportedUserEmail?: string;
  reportedUserId?: string;
  reportedUsername?: string | null;
  reporterUserEmail?: string;
  reporterUserId?: string;
  reporterUsername?: string | null;
  listingId?: string;
  listingTitle?: string | null;
  reportsAgainstUser?: number;
};

type ReportAction =
  | "mark_reviewed"
  | "dismiss"
  | "warn_user"
  | "restrict_user"
  | "suspend_user"
  | "delete_listing"
  | "ban_user"
  | "delete_report";

function fmtUser(username?: string | null, email?: string) {
  if (username) return `@${username.replace(/^@/, "")}`;
  if (email) return email.split("@")[0];
  return "Unknown";
}

function fmtDateTime(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusStyle(status?: string) {
  if (!status || status === "pending") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
  if (status === "reviewed") {
    return "bg-sky-500/10 text-sky-400 border-sky-500/20";
  }
  return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
}

interface Props {
  report: ModerationReport;
  onActionComplete?: () => void;
  compact?: boolean;
}

export default function ReportModerationCard({ report, onActionComplete, compact }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const reportedHandle = fmtUser(report.reportedUsername, report.reportedUserEmail);
  const reporterHandle = fmtUser(report.reporterUsername, report.reporterUserEmail);
  const conversationHref = report.listingId
    ? `/messages?user=${encodeURIComponent(report.reportedUserEmail || "")}&listing=${report.listingId}`
    : `/messages?user=${encodeURIComponent(report.reportedUserEmail || "")}`;
  const historyHref = report.reportedUserEmail
    ? `/manage/reports?against=${encodeURIComponent(report.reportedUserEmail)}`
    : "/manage/reports";
  const profileHref = report.reportedUsername
    ? `/seller/${encodeURIComponent(report.reportedUsername.replace(/^@/, ""))}`
    : report.reportedUserEmail
      ? `/seller/${encodeURIComponent(report.reportedUserEmail)}`
      : null;

  async function runAction(action: ReportAction, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;

    setBusy(action);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/report-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, reportId: report.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");
      showToast("Action completed", "success");
      onActionComplete?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed", "error");
    }
    setBusy(null);
  }

  const evidenceBtn =
    "rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-300";
  const actionNeutral =
    "rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:bg-white/[0.06] disabled:opacity-50";
  const actionSerious =
    "rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50";

  return (
    <div
      className={`rounded-xl border bg-white/[0.02] ${
        !report.status || report.status === "pending"
          ? "border-amber-500/15"
          : "border-white/[0.06]"
      } ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
              {report.type === "listing" ? "Listing report" : "User report"}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusStyle(report.status)}`}
            >
              {report.status || "pending"}
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60">
              {report.reason}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Reported</p>
              <p className="text-base font-bold text-white">{reportedHandle}</p>
              {report.reportedUserEmail && (
                <p className="text-[11px] text-white/40">{report.reportedUserEmail}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Reporter</p>
              <p className="text-base font-bold text-white">{reporterHandle}</p>
              {report.reporterUserEmail && (
                <p className="text-[11px] text-white/40">{report.reporterUserEmail}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
            <span>{fmtDateTime(report.createdAtMs)}</span>
            {typeof report.reportsAgainstUser === "number" && report.reportsAgainstUser > 0 && (
              <span>{report.reportsAgainstUser} report(s) against this user</span>
            )}
            {report.listingTitle && <span>Listing: {report.listingTitle}</span>}
          </div>

          {report.details && !compact && (
            <p className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm leading-relaxed text-white/65">
              {report.details}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Evidence</p>
        <div className="flex flex-wrap gap-2">
          {profileHref && (
            <Link href={profileHref} className={evidenceBtn} target="_blank">
              View User
            </Link>
          )}
          {report.listingId && (
            <Link href={`/post/listing/${report.listingId}`} className={evidenceBtn} target="_blank">
              View Listing
            </Link>
          )}
          {report.reportedUserEmail && (
            <Link href={conversationHref} className={evidenceBtn} target="_blank">
              View Conversation
            </Link>
          )}
          <Link href={historyHref} className={evidenceBtn}>
            Reports History
          </Link>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">Actions</p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!!busy}
              onClick={() => runAction("mark_reviewed")}
              className={actionNeutral}
            >
              {busy === "mark_reviewed" ? "..." : "Mark Reviewed"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => runAction("dismiss")}
              className={actionNeutral}
            >
              {busy === "dismiss" ? "..." : "Dismiss"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => runAction("warn_user")}
              className={actionNeutral}
            >
              {busy === "warn_user" ? "..." : "Warn User"}
            </button>
            <button
              disabled={!!busy || (!report.reportedUserId && !report.reportedUserEmail)}
              onClick={() =>
                runAction(
                  "restrict_user",
                  `Restrict ${reportedHandle}? They won't be able to list or send offers until lifted.`
                )
              }
              className={actionSerious}
            >
              {busy === "restrict_user" ? "..." : "Restrict User"}
            </button>
            <button
              disabled={!!busy || (!report.reportedUserId && !report.reportedUserEmail)}
              onClick={() =>
                runAction(
                  "suspend_user",
                  `Suspend ${reportedHandle}? Their account will be restricted and marked suspended.`
                )
              }
              className={actionSerious}
            >
              {busy === "suspend_user" ? "..." : "Suspend User"}
            </button>
            {report.listingId && (
              <button
                disabled={!!busy}
                onClick={() =>
                  runAction(
                    "delete_listing",
                    `Permanently delete listing "${report.listingTitle || report.listingId}"?`
                  )
                }
                className={actionSerious}
              >
                {busy === "delete_listing" ? "..." : "Delete Listing"}
              </button>
            )}
            <button
              disabled={!!busy || (!report.reportedUserId && !report.reportedUserEmail)}
              onClick={() =>
                runAction(
                  "ban_user",
                  `BAN ${reportedHandle}? This removes listings, restricts the account, and blacklists their phone. This cannot be easily undone.`
                )
              }
              className={actionSerious}
            >
              {busy === "ban_user" ? "..." : "Ban User"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => runAction("delete_report", "Delete this report record only?")}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/40 transition hover:text-white/60 disabled:opacity-50"
            >
              {busy === "delete_report" ? "..." : "Remove report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
