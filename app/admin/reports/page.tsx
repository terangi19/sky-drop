"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import ReportModerationCard, { type ModerationReport } from "../../components/ReportModerationCard";
import AdminNav from "../../components/AdminNav";
import { showToast } from "../../components/Toast";
import { auth } from "../../lib/firebase";

function AdminReportsContent() {
  const searchParams = useSearchParams();
  const against = searchParams.get("against")?.trim().toLowerCase() || "";

  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const loadReports = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    try {
      const url = against
        ? `/api/admin/reports?against=${encodeURIComponent(against)}`
        : "/api/admin/reports";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load reports", "error");
    }
    setLoading(false);
  }, [against]);

  useEffect(() => {
    setLoading(true);
    loadReports();
    const interval = setInterval(loadReports, 20000);
    return () => clearInterval(interval);
  }, [loadReports]);

  const pendingReports = reports.filter((r) => !r.status || r.status === "pending");
  const reviewedReports = reports.filter((r) => r.status === "reviewed" || r.status === "dismissed");
  const visible =
    filter === "pending" ? pendingReports : filter === "reviewed" ? reviewedReports : reports;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((r) => r.id)));
    }
  };

  const bulkDismiss = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/admin/report-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "dismiss", reportIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        showToast(`Dismissed ${selectedIds.size} reports`, "success");
        setSelectedIds(new Set());
        loadReports();
      } else {
        showToast("Failed to dismiss reports", "error");
      }
    } catch {
      showToast("Failed to dismiss reports", "error");
    }
    setBulkActionLoading(false);
  };

  const bulkReview = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/admin/report-action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "review", reportIds: Array.from(selectedIds) }),
      });
      if (res.ok) {
        showToast(`Marked ${selectedIds.size} reports as reviewed`, "success");
        setSelectedIds(new Set());
        loadReports();
      } else {
        showToast("Failed to mark reports as reviewed", "error");
      }
    } catch {
      showToast("Failed to mark reports as reviewed", "error");
    }
    setBulkActionLoading(false);
  };

  return (
    <section className="relative z-10 mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-black text-white">Report Moderation</h1>
        <p className="mt-4 text-[var(--muted)]">
          Review reports with full context — usernames, evidence links, and audited actions.
        </p>
      </div>

      <AdminNav />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Pending</p>
          <p className="mt-1 text-3xl font-black text-sky-400">{pendingReports.length}</p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Reviewed</p>
          <p className="mt-1 text-3xl font-black text-sky-400">{reviewedReports.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Total</p>
          <p className="mt-1 text-3xl font-black text-[var(--foreground)]">{reports.length}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["pending", "all", "reviewed"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold capitalize transition ${
              filter === key
                ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                : "border border-[var(--card-border)] text-[var(--muted)]"
            }`}
          >
            {key}
          </button>
        ))}
        {selectedIds.size > 0 && (
          <>
            <div className="h-6 w-px bg-white/[0.1]" />
            <button
              onClick={toggleSelectAll}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold border border-[var(--card-border)] text-[var(--muted)] hover:bg-white/[0.05] transition"
            >
              {selectedIds.size === visible.length ? "Deselect All" : "Select All"}
            </button>
            <button
              onClick={bulkDismiss}
              disabled={bulkActionLoading}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold border border-sky-500/30 text-sky-400 hover:bg-sky-500/10 transition disabled:opacity-50"
            >
              Dismiss ({selectedIds.size})
            </button>
            <button
              onClick={bulkReview}
              disabled={bulkActionLoading}
              className="rounded-lg px-3 py-1.5 text-[11px] font-bold border border-sky-500/30 text-sky-400 hover:bg-sky-500/10 transition disabled:opacity-50"
            >
              Mark Reviewed ({selectedIds.size})
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          Loading...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-10 text-center">
          <p className="text-lg font-bold">No reports in this view</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((report) => (
            <ReportModerationCard
              key={report.id}
              report={report}
              onActionComplete={loadReports}
              isSelected={selectedIds.has(report.id)}
              onToggleSelect={() => toggleSelect(report.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function AdminReportsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background /><Navbar /><ThemeToggle />
      <Suspense fallback={<div className="p-12 text-center text-[var(--muted)]">Loading...</div>}>
        <AdminReportsContent />
      </Suspense>
    </main>
  );
}
