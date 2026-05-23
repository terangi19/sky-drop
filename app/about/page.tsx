"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

export default function AboutPage() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-6">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">About</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">What is Sky Drop?</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">New Zealand&apos;s community marketplace — buy, sell, and trade with people near you.</p>

        <div className="mt-8 space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Our Mission</h2>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">Sky Drop is built for New Zealanders who want a simple, safe, and modern way to buy and sell. No auctions, no bidding wars, no hidden fees. Just list it, message the seller, and pay securely — all in one place.</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">How It Works</h2>
            <div className="mt-4 space-y-4">
              {[
                { step: "1", title: "Browse or Search", desc: "Find what you need across categories like Cars, Tech, Gaming, Fashion, and more." },
                { step: "2", title: "Message the Seller", desc: "Ask questions, negotiate, or arrange pickup — all through the built-in messaging system." },
                { step: "3", title: "Buy with Confidence", desc: "Pay securely through Stripe. Your payment is protected until you confirm delivery." },
                { step: "4", title: "Leave a Review", desc: "Help the community by rating your experience. Good sellers rise to the top." },
              ].map((item) => (
                <div key={item.step} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-400">{item.step}</div>
                  <div><p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p><p className="text-xs text-[var(--muted)]">{item.desc}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Why Choose Sky Drop?</h2>
            <div className="mt-3 space-y-3">
              {[
                { icon: "🇳🇿", title: "New Zealand Owned", desc: "Built for Kiwis, by Kiwis. All prices in NZD." },
                { icon: "🔒", title: "Secure Payments", desc: "Stripe-powered checkout with buyer protection." },
                { icon: "💬", title: "Built-in Messaging", desc: "Chat with buyers and sellers without leaving the platform." },
                { icon: "💰", title: "Free to List", desc: "No listing fees, no commissions. Pay only for optional upgrades." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3"><span className="text-lg">{item.icon}</span><div><p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p><p className="text-xs text-[var(--muted)]">{item.desc}</p></div></div>
              ))}
            </div>
          </div>
        </div>


      </div>
    </main>
  );
}
