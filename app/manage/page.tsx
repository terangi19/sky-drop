"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { adminFetch, timeAgo } from "../lib/admin-fetch.client";
import { PageHeader, StatGrid, StatCard, Panel, PanelHeader, LoadingBlock } from "../components/manage/ManageUI";

export default function ManageDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/dashboard");
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <LoadingBlock message="Loading dashboard..." />;
  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Marketplace overview — live metrics and recent platform activity."
      />

      <StatGrid>
        <StatCard label="Total Users" value={data.totalUsers ?? 0} href="/manage/users" />
        <StatCard label="New Today" value={data.newUsersToday ?? 0} href="/manage/users" />
        <StatCard label="Active Listings" value={data.activeListings ?? 0} href="/manage/listings" />
        <StatCard label="Listings Today" value={data.listingsToday ?? 0} href="/manage/listings" />
        <StatCard label="Online Users" value={data.usersOnline ?? 0} />
        <StatCard label="Total Sales" value={data.totalSales ?? 0} href="/manage/analytics" />
        <StatCard label="Open Disputes" value={data.openDisputes ?? 0} href="/manage/disputes" />
        <StatCard label="Pending Reports" value={data.pendingReports ?? 0} href="/manage/reports" />
        <StatCard label="KYC Verifications" value={data.pendingVerifications ?? 0} href="/admin/verification" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Recent Activity"
            right={
              <Link href="/manage/activity" className="text-[11px] font-semibold text-sky-400 hover:underline">
                View all
              </Link>
            }
          />
          <div className="max-h-[420px] divide-y divide-[var(--card-border)] overflow-y-auto">
            {(data.activityFeed || []).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">No recent activity</p>
            ) : (
              data.activityFeed.map((item: any) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-sm">{item.icon || "•"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">{item.label}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{timeAgo(item.ts)}</span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Quick Links" />
          <div className="grid grid-cols-2 gap-2 p-4">
            {[
              { href: "/manage/users", label: "Manage Users" },
              { href: "/manage/reports", label: "Review Reports" },
              { href: "/manage/disputes", label: "Open Disputes" },
              { href: "/admin/verification", label: "KYC Verification" },
              { href: "/manage/settings", label: "Site Settings" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md border border-[var(--card-border)] bg-[var(--soft-card)] px-3 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-sky-500/30 hover:text-sky-400"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
