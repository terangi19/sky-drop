"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";
import ThemeToggle from "../../components/ThemeToggle";
import { showToast } from "../../components/Toast";
import { getFreshIdToken } from "../../lib/api-auth";
import TurnstileWidget from "../../components/TurnstileWidget";
import { getTurnstileSiteKey } from "../../lib/turnstile";

const WANTED_CATEGORIES = ["Items", "Services", "Rentals", "Vehicles"];

export default function WantedCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState("Items");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title) {
      showToast("Please enter a title", "error");
      return;
    }
    if (!budget) {
      showToast("Please enter your budget", "error");
      return;
    }

    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to continue.", "error");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const token = await getFreshIdToken();
      if (!token) {
        showToast("Please sign in first", "error");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/create-listing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          turnstileToken,
          title,
          description,
          price: String(budget),
          category,
          location,
          type: "wanted",
          status: "live",
          listingType: "wanted",
          paymentType: "contact",
          pickupAvailable: false,
          shippingAvailable: false,
          acceptOffers: false,
          saleType: "buy_now",
          expiresInDays: 30,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to create listing", "error");
        setLoading(false);
        return;
      }

      showToast("Wanted listing created!", "success");
      router.push("/wanted");
    } catch (err) {
      console.error("Error creating wanted listing:", err);
      showToast("Something went wrong", "error");
    }
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <ThemeToggle />

      <div className="relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 text-center">
          <Link
            href="/wanted"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-black/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-sky-500/40 hover:bg-black/80 mb-5"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="relative flex flex-col items-center">
            <div className="absolute -inset-20 bg-gradient-to-r from-sky-500/5 via-sky-500/5 to-sky-500/5 blur-3xl pointer-events-none" />
            <h1 className="relative text-4xl sm:text-5xl font-black tracking-tight">
              <span className="text-[#0a1628] drop-shadow-[0_0_12px_rgba(14,165,233,0.15)] dark:text-white dark:drop-shadow-[0_0_12px_rgba(14,165,233,0.25)]">Post a Wanted Listing</span>
            </h1>
            <p className="relative mt-3 max-w-xl mx-auto text-sm leading-relaxed text-[#1e4976] dark:text-white">Tell the community what you&apos;re looking for and let sellers come to you.</p>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-sky-500/10 via-sky-500/5 to-transparent blur-xl pointer-events-none" />
          <div className="relative rounded-2xl border border-[#D6ECFF] bg-white p-6 shadow-[0_4px_24px_rgba(14,165,233,0.06)] dark:border-white/[0.06] dark:bg-black/80 dark:shadow-2xl dark:shadow-black/40 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-white outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10"
                  placeholder="What are you looking for?"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-white outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10 resize-none"
                  placeholder="Describe what you're looking for in detail..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Budget *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white">$</span>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] pl-8 pr-4 py-3 text-[var(--foreground)] placeholder:text-white outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-sky-500/20 bg-black/80 px-4 py-3 text-[var(--foreground)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 appearance-none cursor-pointer"
                  >
                    {WANTED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City or region"
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[var(--foreground)] placeholder:text-white outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10"
                />
              </div>

              {/* Awhina panel */}
              <div className="rounded-2xl border border-[#D6ECFF] bg-gradient-to-br from-sky-500/[0.02] to-sky-500/[0.01] p-4 dark:border-sky-500/20 dark:from-sky-500/[0.04] dark:to-black/80">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-sky-500/25 text-base shadow-[0_0_20px_rgba(56,189,248,0.2)] ring-1 ring-sky-400/30">
                    ✦
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-[#111827] dark:text-white">Āwhina</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#6B7280] dark:text-white">
                      Tell me what you&apos;re looking for and I&apos;ll help create your wanted listing
                    </p>
                  </div>
                </div>
              </div>

              <TurnstileWidget
                onToken={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken("")}
                className="mb-3 flex justify-center"
              />
              <button
                type="submit"
                disabled={loading || !title || !budget}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-4 text-lg font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Posting...
                  </span>
                ) : (
                  "Post Wanted Listing"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
