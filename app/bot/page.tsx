"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import { useBot } from "../components/BotProvider";

export default function BotPage() {
  const { running, count, status, start, stop } = useBot();

  return (
    <main className="min-h-screen bg-zinc-950 text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-4">
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
  Back
</Link>
        <h1 className="text-xl font-semibold mb-2">Trade Bot</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Adds random NZ listings every 2 minutes. Auto-deletes after 4 minutes.
          Runs in background - navigate away freely.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className={`h-3 w-3 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-sm text-[var(--muted)]">{running ? "Running" : "Off"}</span>
          </div>

          {count > 0 && (
            <p className="text-sm text-[var(--muted)]">
              Listings added: {count}
            </p>
          )}

          <p className="text-sm text-[var(--muted)] min-h-[20px]">{status}</p>

          <button
            onClick={running ? stop : start}
            className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
              running
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-sky-500 hover:bg-sky-400 text-white"
            }`}
          >
            {running ? "Stop Bot" : "Start Bot"}
          </button>
        </div>
      </div>
    </main>
  );
}
