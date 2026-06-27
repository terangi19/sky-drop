"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";

interface SecurityData {
  integrity: any;
  metrics: any;
  recentDecisions: any[];
  recentSecurityEvents: any[];
}

export default function SecurityDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/security-health", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { setError("Not authorized"); setLoading(false); return; }
        const json = await res.json();
        if (!json.recentDecisions && !json.recentSecurityEvents && json.ok !== undefined) {
          setError("Not authorized");
          setLoading(false);
          return;
        }
        setData(json);
      } catch { setError("Failed to load"); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="min-h-screen bg-[var(--background)] p-8 text-[var(--muted)]">Loading dashboard...</div>;
  if (error) return <div className="min-h-screen bg-[var(--background)] p-8 text-red-400">{error}</div>;
  if (!data) return null;

  const { integrity, metrics, recentDecisions, recentSecurityEvents } = data;

  return (
    <div className="min-h-screen bg-[var(--background)] p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-bold text-white">Security Dashboard</h1>

        {/* System Health Banner */}
        <div className={`mb-6 rounded-xl border p-4 ${
          integrity?.overall === "HEALTHY" ? "border-green-500/30 bg-green-500/10" :
          integrity?.overall === "DEGRADED" ? "border-yellow-500/30 bg-yellow-500/10" :
          "border-red-500/30 bg-red-500/10"
        }`}>
          <span className="text-lg font-bold text-white">System Status: {integrity?.overall || "UNKNOWN"}</span>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--muted)] md:grid-cols-4">
            {integrity?.checks?.map((c: any) => (
              <div key={c.name} className={`rounded-lg px-3 py-1.5 ${
                c.status === "ok" ? "bg-green-500/10 text-green-400" :
                c.status === "degraded" ? "bg-yellow-500/10 text-yellow-400" :
                c.status === "disabled" ? "bg-[var(--soft-card)] text-[var(--muted)]" :
                "bg-red-500/10 text-red-400"
              }`}>
                {c.name}: {c.status}
              </div>
            ))}
          </div>
        </div>

        {/* Live Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Requests/sec", value: metrics?.requestsPerSecond || "0", color: "text-sky-400" },
            { label: "CAPTCHA Rate", value: `${metrics?.captchaRate || "0"}%`, color: metrics?.captchaRate > 15 ? "text-red-400" : "text-green-400" },
            { label: "Block Rate", value: `${metrics?.blockRate || "0"}%`, color: metrics?.blockRate > 5 ? "text-red-400" : "text-green-400" },
            { label: "Shadow Degrade", value: `${metrics?.shadowRate || "0"}%`, color: "text-yellow-400" },
            { label: "Rate Limit Hits", value: String(metrics?.rateLimitHits || 0), color: "text-orange-400" },
            { label: "Upstash", value: metrics?.upstashStatus || "fallback", color: metrics?.upstashStatus === "active" ? "text-green-400" : "text-yellow-400" },
            { label: "Turnstile", value: metrics?.turnstileStatus || "disabled", color: metrics?.turnstileStatus === "active" ? "text-green-400" : "text-zinc-500" },
            { label: "Uptime", value: `${metrics?.uptimeMinutes || 0}m`, color: "text-zinc-400" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4">
              <div className="text-xs text-[var(--muted)]">{m.label}</div>
              <div className={`mt-1 text-2xl font-bold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Verdict Distribution */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Verdict Distribution</h2>
            {metrics?.decisionDistribution ? (
              <div className="space-y-2">
                {Object.entries(metrics.decisionDistribution).map(([verdict, count]) => (
                  <div key={verdict} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--muted)]">{verdict}</span>
                    <span className="text-sm font-bold text-white">{String(count)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-[var(--muted)]">No data</p>}
          </div>

          {/* Top IPs */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Top 20 IPs (15 min)</h2>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {metrics?.topIps?.map((ip: any) => (
                <div key={ip.ip} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">{ip.ip}</span>
                  <span className={ip.blocked > 0 ? "font-bold text-red-400" : "text-[var(--muted)]"}>
                    {ip.count} ({ip.blocked} blocked)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Users */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Top 20 Users (15 min)</h2>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {metrics?.topUsers?.map((u: any) => (
                <div key={u.uid} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">{u.email || u.uid.slice(0, 12)}</span>
                  <span className={u.blocked > 0 ? "font-bold text-red-400" : "text-zinc-500"}>
                    {u.count} ({u.blocked} blocked)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Route Breakdown */}
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-4">
            <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Route Breakdown</h2>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {metrics?.routeBreakdown && Object.entries(metrics.routeBreakdown).map(([route, rc]: [string, any]) => (
                <div key={route} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--muted)]">{route}</span>
                  <span className="text-[var(--muted)]">{rc.requests} req / {rc.blocked} blk</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Decisions */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Recent Abuse Decisions</h2>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)]">
            <table className="w-full text-xs">
              <thead className="border-b border-[var(--card-border)] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Verdict</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">IP</th>
                </tr>
              </thead>
              <tbody>
                {recentDecisions.map((d: any) => (
                  <tr key={d.id} className="border-b border-[var(--card-border)]/50 hover:bg-[var(--soft-card)]/30">
                    <td className="px-3 py-1.5 text-[var(--muted)]">{d.timestamp?.toDate?.()?.toLocaleTimeString() || "-"}</td>
                    <td className="px-3 py-1.5 text-[var(--foreground)]">{d.action || "-"}</td>
                    <td className={`px-3 py-1.5 font-medium ${
                      d.verdict === "block" ? "text-red-400" :
                      d.verdict === "shadow_degrade" ? "text-yellow-400" :
                      d.verdict === "slow" ? "text-orange-400" :
                      "text-green-400"
                    }`}>{d.verdict || "-"}</td>
                    <td className="px-3 py-1.5 text-[var(--muted)]">{d.score != null ? d.score : "-"}</td>
                    <td className="px-3 py-1.5 text-[var(--muted)]">{d.ip || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Security Events */}
        <div>
          <h2 className="mb-3 text-sm font-bold text-[var(--foreground)]">Security Events</h2>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)]">
            <table className="w-full text-xs">
              <thead className="border-b border-[var(--card-border)] text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 text-left">Time</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Severity</th>
                  <th className="px-3 py-2 text-left">Message</th>
                </tr>
              </thead>
              <tbody>
                {recentSecurityEvents.map((e: any) => (
                  <tr key={e.id} className="border-b border-[var(--card-border)]/50 hover:bg-[var(--soft-card)]/30">
                    <td className="px-3 py-1.5 text-[var(--muted)]">{e.timestamp?.toDate?.()?.toLocaleTimeString() || "-"}</td>
                    <td className="px-3 py-1.5 text-[var(--foreground)]">{e.type || "-"}</td>
                    <td className={`px-3 py-1.5 font-medium ${
                      e.severity === "critical" ? "text-red-400" :
                      e.severity === "warning" ? "text-yellow-400" : "text-[var(--muted)]"
                    }`}>{e.severity || "-"}</td>
                    <td className="px-3 py-1.5 text-[var(--muted)]">{(e.message || "").slice(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
