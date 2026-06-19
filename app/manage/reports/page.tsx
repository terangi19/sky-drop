"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReportModerationCard, { type ModerationReport } from "../../components/ReportModerationCard";
import { adminFetch } from "../../lib/admin-fetch.client";
import { PageHeader, LoadingBlock } from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

function ManageReportsContent() {
  const searchParams = useSearchParams();
  const against = searchParams.get("against")?.trim().toLowerCase() || "";
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending");

  const loadReports = useCallback(async () => {
    try {
      const url = against
        ? `/api/admin/reports?against=${encodeURIComponent(against)}`
        : "/api/admin/reports";
      const data = await adminFetch(url);
      setReports(data.reports || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load reports", "error");
    }
    setLoading(false);
  }, [against]);

  useEffect(() => {
    setLoading(true);
    loadReports();
    const interval = setInterval(loadReports, 20000);
    return () => clearInterval(interval);
  }, [loadReports]);

  const pending = reports.filter((r) => !r.status || r.status === "pending");
  const reviewed = reports.filter((r) => r.status === "reviewed" || r.status === "dismissed");
  const visible = filter === "pending" ? pending : filter === "reviewed" ? reviewed : reports;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={against ? `History for ${against}` : "Central moderation queue — review with full context and evidence."}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pending", "all", "reviewed"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md border px-3 py-1.5 text-[11px] font-bold capitalize ${
              filter === key ? "border-sky-500/30 bg-sky-500/10 text-sky-400" : "border-[var(--card-border)] text-[var(--muted)]"
            }`}
          >
            {key} {key === "pending" ? `(${pending.length})` : ""}
          </button>
        ))}
        {against && (
          <a href="/manage/reports" className="text-xs text-sky-400 hover:underline">Clear filter</a>
        )}
      </div>

      {loading ? (
        <LoadingBlock message="Loading reports..." />
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-10 text-center text-sm text-[var(--muted)]">
          No reports in this view
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((report) => (
            <ReportModerationCard key={report.id} report={report} onActionComplete={loadReports} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManageReportsPage() {
  return (
    <Suspense fallback={<LoadingBlock message="Loading..." />}>
      <ManageReportsContent />
    </Suspense>
  );
}
