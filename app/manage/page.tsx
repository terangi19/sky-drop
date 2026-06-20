"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { adminFetch, timeAgo } from "../lib/admin-fetch.client";
import { LoadingBlock } from "../components/manage/ManageUI";

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

  const stats = [
    { label: "Total Users", value: data.totalUsers ?? 0, href: "/manage/users", icon: "👥", color: "from-sky-500 to-sky-400" },
    { label: "New Today", value: data.newUsersToday ?? 0, href: "/manage/users", icon: "📈", color: "from-emerald-500 to-emerald-400" },
    { label: "Active Listings", value: data.activeListings ?? 0, href: "/manage/listings", icon: "📦", color: "from-violet-500 to-violet-400" },
    { label: "Listings Today", value: data.listingsToday ?? 0, href: "/manage/listings", icon: "✨", color: "from-amber-500 to-amber-400" },
    { label: "Online Users", value: data.usersOnline ?? 0, icon: "🟢", color: "from-green-500 to-green-400" },
    { label: "Total Sales", value: data.totalSales ?? 0, href: "/manage/analytics", icon: "💰", color: "from-pink-500 to-pink-400" },
    { label: "Open Disputes", value: data.openDisputes ?? 0, href: "/manage/disputes", icon: "⚠️", color: "from-red-500 to-red-400" },
    { label: "Pending Reports", value: data.pendingReports ?? 0, href: "/manage/reports", icon: "📋", color: "from-orange-500 to-orange-400" },
    { label: "KYC Verifications", value: data.pendingVerifications ?? 0, href: "/admin/verification", icon: "🔐", color: "from-cyan-500 to-cyan-400" },
  ];

  const quickLinks = [
    { href: "/manage/users", label: "Manage Users", icon: "👥", desc: "View and manage user accounts" },
    { href: "/manage/reports", label: "Review Reports", icon: "📋", desc: "Handle user reports" },
    { href: "/manage/disputes", label: "Open Disputes", icon: "⚠️", desc: "Resolve transaction disputes" },
    { href: "/admin/verification", label: "KYC Verification", icon: "🔐", desc: "Review ID verifications" },
    { href: "/manage/settings", label: "Site Settings", icon: "⚙️", desc: "Configure platform settings" },
    { href: "/manage/analytics", label: "Analytics", icon: "📊", desc: "View platform analytics" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Marketplace overview — live metrics and recent platform activity.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href || "#"}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-4 transition-all duration-300 hover:border-sky-500/20 hover:shadow-[0_0_20px_rgba(14,165,233,0.08)] hover:-translate-y-0.5"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.color} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Recent Activity</h2>
            <Link href="/manage/activity" className="text-[11px] font-semibold text-sky-400 hover:underline">
              View all
            </Link>
          </div>
          <div className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto">
            {(data.activityFeed || []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">No recent activity</p>
            ) : (
              data.activityFeed.map((item: any) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-sm">
                    {item.icon || "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--foreground)]">{item.label}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{timeAgo(item.ts)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Links */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="border-b border-white/[0.04] px-5 py-4">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Quick Links</h2>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group flex flex-col gap-2 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 transition-all duration-300 hover:border-sky-500/20 hover:bg-white/[0.04] hover:shadow-[0_0_20px_rgba(14,165,233,0.04)] hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{link.icon}</span>
                    <span className="text-sm font-semibold text-[var(--foreground)] group-hover:text-sky-400 transition-colors">
                      {link.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)]">{link.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
