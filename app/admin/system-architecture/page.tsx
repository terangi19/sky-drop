"use client";

import { useEffect, useState } from "react";

interface ComponentStatus {
  name: string;
  status: string;
  message: string;
}

export default function SystemArchitecturePage() {
  const [components, setComponents] = useState<ComponentStatus[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/security-health");
        const data = await res.json();
        if (data.integrity?.checks) {
          setComponents(data.integrity.checks);
        }
      } catch {}
    })();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "border-green-500/30 bg-green-500/10 text-green-400";
      case "degraded": return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
      case "failed": return "border-red-500/30 bg-red-500/10 text-red-400";
      case "disabled": return "border-zinc-700 bg-zinc-800/50 text-zinc-500";
      default: return "border-zinc-700 bg-zinc-800/50 text-zinc-400";
    }
  };

  const flowSteps = [
    { id: "client", label: "Client Browser", type: "input", children: [
      { id: "edge", label: "Edge Proxy", desc: "Burst: 25/10s, Global: 100/min, Strict per-route" },
      { id: "auth", label: "Firebase Auth", desc: "JWT token verification" },
      { id: "turnstile", label: "Turnstile (probabilistic)", desc: "Captcha triggered on risk basis" },
      { id: "rate", label: "Upstash Redis", desc: "Distributed sliding window rate limiter" },
      { id: "engine", label: "Abuse Decision Engine", desc: "Unified verdict: allow / slow / captcha / shadow / block", children: [
        { id: "graph", label: "Account Graph", desc: "IP clustering, content similarity, bot farm detection" },
        { id: "friction", label: "Adaptive Friction", desc: "Behavioral signals, risk tiers, trust acceleration" },
        { id: "risk", label: "riskFlag check", desc: "Firestore profile riskFlag lookup" },
      ]},
      { id: "idempotency", label: "Redis Idempotency", desc: "SET requestId EX 90 NX — prevents duplicates" },
      { id: "action", label: "Admin SDK → Firestore", desc: "All mutations via server API routes only", type: "output" },
      { id: "audit", label: "abuse_decision_log", desc: "Every non-allow action is logged", type: "output" },
    ]},
  ];

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold text-white">System Architecture</h1>

        {/* Request Flow */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-500">Request Flow</h2>
          <div className="space-y-1">
            {flowSteps[0].children.map((step, i) => (
              <div key={step.id}>
                <div className="flex items-center gap-3">
                  {i > 0 && <div className="ml-4 h-4 w-px bg-zinc-700" />}
                  <div className={`flex-1 rounded-lg border p-3 text-sm ${getStatusColor(
                    components.find(c => c.name.toLowerCase().includes(step.id))?.status || "ok"
                  )}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{step.label}</span>
                      <span className="text-xs opacity-60">{i + 1}</span>
                    </div>
                    {(step as any).desc && <div className="mt-1 text-xs opacity-60">{(step as any).desc}</div>}
                  </div>
                </div>
                {/* Sub-steps */}
                {(step as any).children?.map((sub: any, j: number) => (
                  <div key={sub.id} className="ml-8 flex items-center gap-3">
                    <div className="h-6 w-px bg-zinc-800" />
                    <div className={`flex-1 rounded-lg border p-2 text-xs ${getStatusColor(
                      components.find(c => c.name.toLowerCase().includes(sub.id))?.status || "ok"
                    )}`}>
                      <span className="font-medium">{sub.label}</span>
                      <span className="ml-2 opacity-60">{sub.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Component Status Table */}
        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-zinc-500">Component Status</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Component</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-zinc-300">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.status === "ok" ? "bg-green-500/20 text-green-400" :
                        c.status === "degraded" ? "bg-yellow-500/20 text-yellow-400" :
                        c.status === "disabled" ? "bg-zinc-700 text-zinc-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{c.message}</td>
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
