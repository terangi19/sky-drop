"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";
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

  return (
    <section className="relative z-10 mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-black text-white">Report Moderation</h1>
        <AwhinaUnderHeader className="mt-2" />
        <p className="mt-2 text-[var(--muted)]">
          Review reports with full context — usernames, evidence links, and audited actions.
        </p>
      </div>

      <AdminNav />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/20 bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Pending</p>
          <p className="mt-1 text-3xl font-black text-amber-400">{pendingReports.length}</p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Reviewed</p>
          <p className="mt-1 text-3xl font-black text-sky-400">{reviewedReports.length}</p>
        </div>
        <div className="rounded-2xl border border-zinc-500/20 bg-[var(--card)] p-5 shadow-xl">
          <p className="text-sm text-[var(--muted)]">Total</p>
          <p className="mt-1 text-3xl font-black text-[var(--foreground)]">{reports.length}</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2">
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
            <ReportModerationCard key={report.id} report={report} onActionComplete={loadReports} />
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
