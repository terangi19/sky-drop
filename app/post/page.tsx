"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { useEffect, useState } from "react";

export default function PostPage() {
  const [preferredMethod, setPreferredMethod] = useState<"awhina" | "manual" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("listingMethodPreference");
    if (saved === "awhina" || saved === "manual") {
      setPreferredMethod(saved);
    }
  }, []);

  const handleSelect = (method: "awhina" | "manual") => {
    localStorage.setItem("listingMethodPreference", method);
    window.location.href = "/post/ai";
  };

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="btn btn-secondary mb-6"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Sell</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            How would you like to create your listing?
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Both methods create the same final listing — the only difference is how it&apos;s created.
          </p>
        </div>

        <div className="space-y-3" role="list">
          <button
            type="button"
            onClick={() => handleSelect("awhina")}
            className={`w-full rounded-xl border p-6 text-left transition-colors ${
              preferredMethod === "awhina"
                ? "border-sky-500/40 bg-sky-500/[0.08]"
                : "border-[var(--card-border)] bg-[var(--card)] hover:border-sky-500/25 hover:bg-[var(--card-hover)]"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400" aria-hidden>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">Create with Āwhina</h2>
                  {preferredMethod === "awhina" && (
                    <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-400">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Describe your item and let Āwhina draft title, description, category, and pricing suggestions.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                  <li>Describe your item naturally</li>
                  <li>Upload photos if available</li>
                  <li>Review and edit everything before publishing</li>
                </ul>
                <div className="mt-4">
                  <span className="btn btn-primary btn-sm pointer-events-none">Create with Āwhina</span>
                  {preferredMethod === "awhina" && (
                    <span className="ml-2 text-xs text-sky-400">Your preferred method</span>
                  )}
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("manual")}
            className={`w-full rounded-xl border p-6 text-left transition-colors ${
              preferredMethod === "manual"
                ? "border-sky-500/40 bg-sky-500/[0.08]"
                : "border-[var(--card-border)] bg-[var(--card)] hover:border-sky-500/25 hover:bg-[var(--card-hover)]"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--pill-bg)] text-[var(--muted)]" aria-hidden>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-10.976.275.275-2.976a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Create Manually</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  Prefer full control? Complete the listing yourself using the standard form.
                </p>
                <div className="mt-4">
                  <span className="btn btn-secondary btn-sm pointer-events-none">Create Manually</span>
                  {preferredMethod === "manual" && (
                    <span className="ml-2 text-xs text-sky-400">Your preferred method</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] p-5 text-center">
          <p className="text-sm text-[var(--muted)]">
            You can switch between Manual and Āwhina during the listing process at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
