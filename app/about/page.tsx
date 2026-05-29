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
                { step: "3", title: "Buy with Confidence", desc: "Pay securely through Stripe. Your payment is held in escrow until you confirm delivery." },
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

          {/* Trust & Safety */}
          <div className="rounded-xl border border-emerald-500/10 bg-gradient-to-b from-emerald-500/[0.03] to-transparent p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🛡️</span>
              <h2 className="text-sm font-bold text-[var(--foreground)]">Trust & Safety</h2>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">We take your safety seriously. Here&apos;s how we protect every transaction on Sky Drop.</p>
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">💰 Payment Escrow</p>
                <p className="mt-1 text-xs text-[var(--muted)]">When you buy an item, your payment is held securely by Sky Drop. The seller only receives the funds after you confirm delivery. If something goes wrong, you can open a dispute within 7 days and request a full refund.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">🔐 Verified Payments</p>
                <p className="mt-1 text-xs text-[var(--muted)]">All payments are processed through Stripe, a globally trusted payment provider. We never store your card details. Every transaction includes a $1 buyer protection fee.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">🛡️ Scam Prevention</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Every listing is scanned for scam language, suspicious pricing, and duplicate content before it goes live. Sellers must verify their email to list items. New sellers have listing limits until they build a sales history.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">📋 Verified Reviews</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Only verified buyers who actually purchased an item can leave a review. This prevents fake reviews and ensures ratings reflect real experiences.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">📩 Safe Messaging</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Our messaging system detects and warns against off-platform contact attempts. Keep all communication on Sky Drop for dispute protection. Never share your email, phone number, or payment details outside the platform.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-emerald-400">⚖️ Dispute Resolution</p>
                <p className="mt-1 text-xs text-[var(--muted)]">If an order doesn&apos;t arrive or isn&apos;t as described, you can open a dispute within 7 days of delivery. An admin reviews the case and can issue a full refund. Funds are held in escrow until disputes are resolved.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/faqs" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">FAQs →</Link>
              <Link href="/terms" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Terms of Service →</Link>
              <Link href="/privacy" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Privacy Policy →</Link>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Questions?</h2>
            <p className="mt-2 text-xs text-[var(--muted)]">Check our <Link href="/faqs" className="text-sky-400 underline">FAQs</Link> or send us a message through the platform.</p>
          </div>
        </div>

      </div>
    </main>
  );
}
