"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import AdminNav from "../../components/AdminNav";
import { auth } from "../../lib/firebase";
import { showToast } from "../../components/Toast";

interface MessageFlag {
  id: string;
  messageId: string;
  sender?: string;
  participants?: string[];
  keywords: string[];
  text?: string;
  status: string;
  createdAt?: number;
}

export default function MessageFlagsAdmin() {
  const [flags, setFlags] = useState<MessageFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending_review" | "reviewed" | "dismissed" | "all">("pending_review");

  const loadFlags = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    try {
      const url = filter === "all" ? "/api/admin/message-flags" : `/api/admin/message-flags?status=${filter}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFlags(data.flags || []);
      } else {
        showToast("Failed to load message flags", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load message flags", "error");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadFlags();
    const interval = setInterval(loadFlags, 20000);
    return () => clearInterval(interval);
  }, [loadFlags]);

  async function updateStatus(flagId: string, action: "reviewed" | "dismissed") {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    try {
      const res = await fetch("/api/admin/message-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ flagId, action }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`Flag ${action}`, "success");
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch {
      showToast("Failed to update flag", "error");
    }
  }

  const filtered = filter === "all" ? flags : flags.filter((f) => f.status === filter);
  const pendingCount = flags.filter((f) => f.status === "pending_review").length;

  return (
    <main className="relative min-h-screen bg-[var(--background)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white">Message Flags</h1>
          <p className="mt-2 text-[var(--muted)]">
            Auto-flagged messages containing off-platform payment language.
          </p>
        </div>

        <AdminNav />

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Pending</p>
            <p className="mt-1 text-3xl font-black text-amber-400">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border border-sky-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Total</p>
            <p className="mt-1 text-3xl font-black text-sky-400">{flags.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-500/20 bg-[var(--card)] p-5 shadow-xl">
            <p className="text-sm text-[var(--muted)]">Filter</p>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="mt-1 w-full rounded-lg border border-white/[0.08] bg-zinc-900 px-2 py-1 text-sm text-[var(--foreground)]"
            >
              <option value="pending_review">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {loading && <p className="text-[var(--muted)]">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-[var(--muted)]">No message flags found.</p>
          )}
          {filtered.map((flag) => (
            <div key={flag.id} className="rounded-2xl border border-white/[0.08] bg-[var(--card)] p-5 shadow-xl">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400">
                  {flag.status}
                </span>
                {flag.keywords.map((k) => (
                  <span key={k} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
                    {k}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-[var(--muted)]">
                  {flag.createdAt ? new Date(flag.createdAt).toLocaleString() : ""}
                </span>
              </div>

              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {flag.text || "(no text)"}
              </p>

              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>Sender: {flag.sender}</span>
                <span>·</span>
                <Link
                  href={`/messages?flag=${flag.messageId}`}
                  className="text-sky-400 hover:underline"
                >
                  View conversation
                </Link>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => updateStatus(flag.id, "dismissed")}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-[var(--foreground)] transition hover:bg-white/[0.06]"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => updateStatus(flag.id, "reviewed")}
                  className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl"
                >
                  Mark Reviewed
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
