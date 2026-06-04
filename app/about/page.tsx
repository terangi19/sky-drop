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
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              Sky Drop is built for New Zealanders who want a simple, safe, and modern way to buy and sell. No auctions, no bidding wars — just list at a clear price, message the seller, and pay with Stripe Checkout or arrange payment in chat. Any platform fees are shown upfront before you complete a purchase, never buried in fine print.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">How It Works</h2>
            <div className="mt-4 space-y-4">
              {[
                { step: "1", title: "Browse or Search", desc: "Find what you need across categories like Cars, Tech, Gaming, Fashion, and more." },
                { step: "2", title: "Message the Seller", desc: "Ask questions, negotiate, or arrange pickup — all through the built-in messaging system." },
                { step: "3", title: "Buy with Confidence", desc: "Pay with Stripe Checkout on supported listings, or use Arrange Purchase to agree payment in chat." },
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
                { icon: "🔒", title: "Flexible Payments", desc: "Stripe Checkout on-platform, or Arrange Purchase when you prefer to pay the seller directly." },
                { icon: "💬", title: "Built-in Messaging", desc: "Chat with buyers and sellers without leaving the platform." },
                { icon: "💰", title: "Transparent pricing", desc: "Free to list today. Buyer and platform fees (when they apply) are shown clearly at checkout — see Payment Details for the current breakdown." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3"><span className="text-lg">{item.icon}</span><div><p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p><p className="text-xs text-[var(--muted)]">{item.desc}</p></div></div>
              ))}
            </div>
          </div>

          {/* Payments & Protections */}
          <div className="rounded-xl border border-amber-500/10 bg-gradient-to-b from-amber-500/[0.03] to-transparent p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">💳</span>
              <h2 className="text-sm font-bold text-[var(--foreground)]">How Payments Work</h2>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">Sellers choose how buyers pay when listing an item. All card payments go directly to the seller&apos;s Stripe Express account — Sky Drop never holds your money.</p>
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-amber-400">💳 Stripe Checkout</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Buy Now pays by card through Stripe. Funds go straight to the seller&apos;s Stripe Express account via destination charges. A $1 buyer protection fee is added. Disputes handled from your Purchases page.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-amber-400">🤝 Arrange Purchase</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Tap Purchase to open a chat and agree payment — bank transfer, cash, or pickup. Payment happens directly between you and the seller. No card checkout, no dispute protection.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-amber-400">⚖️ Dispute resolution (Stripe only)</p>
                <p className="mt-1 text-xs text-[var(--muted)]">For Stripe Checkout orders, open a dispute within 7 days if something goes wrong. An admin reviews the case and can issue a refund through Stripe. Arrange Purchases are between you and the seller.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-amber-400">🛡️ Content moderation</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Listings are scanned for scam language, suspicious pricing, and duplicates before going live. Sellers verify email and phone. Stripe Express is required only for Stripe Checkout listings.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-amber-400">💬 Messaging safety</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Our messaging system warns if someone tries to move the conversation off-platform. Keep communication on Sky Drop to stay protected. Only verified buyers can leave reviews.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/escrow" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Full Payment Details →</Link>
              <Link href="/faqs" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">FAQs →</Link>
              <Link href="/terms" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Terms of Service →</Link>
              <Link href="/privacy" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Privacy Policy →</Link>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Questions?</h2>
            <p className="mt-2 text-xs text-[var(--muted)]">Check our <Link href="/faqs" className="text-sky-400 underline">FAQs</Link> or send us a message through the platform. You can also reach us at <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support@skydrop.nz" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">support@skydrop.nz</a>.</p>
          </div>
        </div>

      </div>
    </main>
  );
}
