"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { useEffect, useState } from "react";

export default function PostPage() {
  const [preferredMethod, setPreferredMethod] = useState<"awhina" | "manual" | null>(null);

  useEffect(() => {
    // Load user's preferred method from localStorage
    const saved = localStorage.getItem("listingMethodPreference");
    if (saved === "awhina" || saved === "manual") {
      setPreferredMethod(saved);
    }
  }, []);

  const handleSelect = (method: "awhina" | "manual") => {
    // Save preference
    localStorage.setItem("listingMethodPreference", method);
    // Both methods use the AI page which supports both AI and manual editing
    window.location.href = "/post/ai";
  };

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-6">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Sell</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">How would you like to create your listing?</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Both methods create the same final listing — the only difference is how it's created.</p>
        </div>

        <div className="space-y-4">
          {/* Āwhina Option */}
          <button
            onClick={() => handleSelect("awhina")}
            className={`w-full rounded-xl border p-6 text-left transition-all ${
              preferredMethod === "awhina"
                ? "border-sky-500/50 bg-sky-500/[0.08] shadow-[0_0_30px_rgba(14,165,233,0.15)]"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-800/60"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-2xl">
                🤖
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[var(--foreground)]">Create with Āwhina</h2>
                  {preferredMethod === "awhina" && (
                    <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">Let Āwhina do most of the work.</p>
                <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400">•</span>
                    <span>Describe your item naturally</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400">•</span>
                    <span>Upload photos if available</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400">•</span>
                    <span>Āwhina generates title, description, category, pricing suggestions, and listing details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400">•</span>
                    <span>Review and edit everything before publishing</span>
                  </li>
                </ul>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20">
                    Create with Āwhina
                  </span>
                  {preferredMethod === "awhina" && (
                    <span className="text-xs text-sky-400">Your preferred method</span>
                  )}
                </div>
              </div>
            </div>
          </button>

          {/* Manual Option */}
          <button
            onClick={() => handleSelect("manual")}
            className={`w-full rounded-xl border p-6 text-left transition-all ${
              preferredMethod === "manual"
                ? "border-sky-500/50 bg-sky-500/[0.08] shadow-[0_0_30px_rgba(14,165,233,0.15)]"
                : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-800/60"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-2xl">
                ✍️
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-[var(--foreground)]">Create Manually</h2>
                <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">Prefer full control?</p>
                <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">Complete the listing yourself using the standard listing form.</p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-bold text-[var(--foreground)] transition hover:bg-zinc-700">
                    Create Manually
                  </span>
                  {preferredMethod === "manual" && (
                    <span className="text-xs text-sky-400">Your preferred method</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            You can switch between Manual and Āwhina during the listing process at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
