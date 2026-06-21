"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { auth } from "../lib/firebase";

// Code split heavy components
const Navbar = dynamic(() => import("../components/Navbar"), { loading: () => <div className="h-16" /> });
const Background = dynamic(() => import("../components/Background"), { ssr: false });
const ThemeToggle = dynamic(() => import("../components/ThemeToggle"));
const AdminNav = dynamic(() => import("../components/AdminNav"), { loading: () => <div className="h-12" /> });

type DashStats = {
  pendingReports: number;
  openDisputes: number;
  flaggedListings: number;
  pendingVerifications: number;
  usersOnline: number;
  newUsersToday: number;
  listingsToday: number;
  messagesToday: number;
  totalUsers: number;
  newUsersWeek: number;
  totalSales: number;
  activeListings: number;
  activityFeed: { id: string; label: string; detail: string; ts: number; icon: string }[];
};

function StatCard({ label, value, sub, href, urgent }: { label: string; value: number | string; sub?: string; href?: string; urgent?: boolean }) {
  const inner = (
    <div className={`rounded-2xl border p-5 transition ${urgent && Number(value) > 0 ? "border-red-500/30 bg-red-500/5" : "border-white/[0.08] bg-white/[0.03]"} ${href ? "hover:bg-white/[0.06] cursor-pointer" : ""}`}>
      <p className="text-xs text-[var(--muted)] font-medium mb-1">{label}</p>
      <p className={`text-3xl font-black ${urgent && Number(value) > 0 ? "text-red-400" : "text-[var(--foreground)]"}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <div>{inner}</div>;
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { setError("Failed to load"); setLoading(false); return; }
        setStats(await res.json());
      } catch {
        setError("Failed to load dashboard");
      }
      setLoading(false);
    })();
  }, []);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <ThemeToggle />
      <section className="relative z-10 mx-auto max-w-6xl px-4 pt-28 pb-20">
        <div className="mb-8">
          <h1 className="text-3xl font-black">Admin Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Sky Drop — live platform overview</p>
        </div>

        <AdminNav />

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {stats && (
          <div className="space-y-8">
            {/* Action Required */}
            {(stats.pendingReports > 0 || stats.openDisputes > 0 || stats.pendingVerifications > 0 || stats.flaggedListings > 0) && (
              <div>
                <h2 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-3">⚠ Needs Attention</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Pending Reports" value={stats.pendingReports} href="/admin/reports" urgent />
                  <StatCard label="Open Disputes" value={stats.openDisputes} href="/admin/disputes" urgent />
                  <StatCard label="KYC Pending" value={stats.pendingVerifications} href="/admin/verification" urgent />
                  <StatCard label="Flagged Listings" value={stats.flaggedListings} href="/admin/reports" urgent />
                </div>
              </div>
            )}

            {/* Platform Overview */}
            <div>
              <h2 className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-3">📊 Platform Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <StatCard label="Total Users" value={stats.totalUsers} sub={`+${stats.newUsersWeek} this week`} />
                <StatCard label="Active Listings" value={stats.activeListings} />
                <StatCard label="Total Sales" value={stats.totalSales} />
                <StatCard label="Users Online" value={stats.usersOnline} sub="Now" />
              </div>
            </div>

            {/* Today's Activity */}
            <div>
              <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">📈 Today's Activity</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="New Users" value={stats.newUsersToday} />
                <StatCard label="New Listings" value={stats.listingsToday} />
                <StatCard label="Messages" value={stats.messagesToday} />
              </div>
            </div>

            {/* Activity Feed */}
            {stats.activityFeed?.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">🔔 Recent Activity</h2>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  {stats.activityFeed.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 text-sm">
                      <span className="text-lg">{item.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-[var(--foreground)]">{item.label}</p>
                        <p className="text-xs text-[var(--muted)]">{item.detail}</p>
                      </div>
                      <span className="text-xs text-[var(--muted)]">{timeAgo(item.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
