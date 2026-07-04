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

          {/* AI Section */}
          <div className="rounded-xl border border-sky-500/10 bg-gradient-to-b from-sky-500/[0.03] to-transparent p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sm">✦</span>
              <h2 className="text-sm font-bold text-[var(--foreground)]">Meet Āwhina — Your AI Listing Assistant</h2>
            </div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Āwhina is Sky Drop&apos;s built-in AI assistant. She can auto-fill your listing details, generate titles and descriptions, suggest fair NZD prices, and answer questions about the platform. Just describe what you&apos;re selling and Āwhina handles the rest. Available across most pages — tap the chat bubble to get started.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/post/ai" className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20">Try Sell with Āwhina →</Link>
            </div>
          </div>

          {/* Mission */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Our Mission</h2>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
              Sky Drop is a New Zealand marketplace built on transparency, trust, and fairness. We believe buying and selling should be straightforward — list at a clear price, message the seller directly, and choose the payment method that works for you, whether that&apos;s Stripe Checkout or Arrange Purchase. Any fees are disclosed upfront before you complete a transaction, never hidden in fine print. Our mission is to provide Kiwis with a modern, secure, and honest platform to trade with confidence.
            </p>
          </div>

          {/* How It Works */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">How It Works</h2>
            <div className="mt-4 space-y-4">
              {[
                { step: "1", title: "Browse or Search", desc: "Find what you need across categories like Cars, Tech, Gaming, Fashion, Home, Sports, and more." },
                { step: "2", title: "Message the Seller", desc: "Ask questions, negotiate, or arrange pickup — all through the built-in messaging system." },
                { step: "3", title: "Buy with Confidence", desc: "Pay with Stripe Checkout on supported listings, or use Arrange Purchase to agree payment directly in chat." },
                { step: "4", title: "Leave a Review", desc: "Help the community by rating your experience. Only verified buyers can leave reviews." },
              ].map((item) => (
                <div key={item.step} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sm font-bold text-sky-400">{item.step}</div>
                  <div><p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p><p className="text-xs text-[var(--muted)]">{item.desc}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Why Choose */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Why Choose Sky Drop?</h2>
            <div className="mt-3 space-y-3">
              {[
                { icon: "🇳🇿", title: "New Zealand Owned", desc: "Built for Kiwis, by Kiwis. All prices in NZD." },
                { icon: "🤖", title: "AI-Powered Listing", desc: "Āwhina helps you create professional listings in seconds. Describe what you're selling and she fills in the details." },
                { icon: "🪪", title: "Verified Sellers", desc: "Sellers complete identity verification before listing. This helps prevent fraud and ensures buyers are dealing with real, accountable people." },
                { icon: "🔒", title: "Flexible Payments", desc: "Stripe Checkout on-platform with dispute protection, or Arrange Purchase when you prefer bank transfer or cash." },
                { icon: "💬", title: "Built-in Messaging", desc: "Chat with buyers and sellers without leaving the platform. All communication stays on Sky Drop for your protection." },
                { icon: "💰", title: "Transparent Pricing", desc: "Free to list today. Buyer and platform fees (when they apply) are shown clearly at checkout." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3"><span className="text-lg">{item.icon}</span><div><p className="text-sm font-bold text-[var(--foreground)]">{item.title}</p><p className="text-xs text-[var(--muted)]">{item.desc}</p></div></div>
              ))}
            </div>
          </div>

          {/* Payments & Protections */}
          <div className="rounded-xl border border-sky-500/10 bg-gradient-to-b from-sky-500/[0.03] to-transparent p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🛡️</span>
              <h2 className="text-sm font-bold text-[var(--foreground)]">How Payments & Protection Work</h2>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">Sellers choose how buyers pay when listing an item. All card payments go directly to the seller&apos;s Stripe Express account — Sky Drop never holds your money.</p>
            <div className="space-y-4">
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">💳 Stripe Checkout</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Pay by card with a $1 buyer protection fee. Funds go straight to the seller&apos;s Stripe Express account. Disputes handled from your Purchases page within 7 days.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">🤝 Arrange Purchase</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Tap Purchase to open a chat and agree payment — bank transfer, cash, or pickup. Payment happens directly between you and the seller. Keep communication on Sky Drop so we can review evidence if something goes wrong.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">🪪 Identity Verification</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Sellers complete identity verification before listing. This helps prevent fraud and ensures buyers are dealing with real, accountable people. Identity documents are stored securely and never shared publicly.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">⚖️ Dispute Resolution</p>
                <p className="mt-1 text-xs text-[var(--muted)]">For Stripe Checkout orders, open a dispute within 7 days if something goes wrong. An admin reviews the case and can issue a refund through Stripe. For Arrange Purchase, we may review evidence and take action against accounts that violate marketplace rules.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">💬 Messaging Safety</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Our messaging system warns if someone tries to move the conversation off-platform. Keep all communication on Sky Drop to stay protected. Only verified buyers can leave reviews.</p>
              </div>

              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">
                <p className="text-sm font-bold text-sky-400">👮 Fraud Prevention</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Accounts involved in scams, deception, or illegal activity may be permanently removed from the platform and may be referred to law enforcement agencies or other appropriate authorities where legally required.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/buyer-protection" className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/20">Buyer Protection →</Link>
              <Link href="/payments" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Payment Details →</Link>
              <Link href="/faqs" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">FAQs →</Link>
              <Link href="/terms" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Terms →</Link>
              <Link href="/privacy" className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">Privacy →</Link>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Questions?</h2>
            <p className="mt-2 text-xs text-[var(--muted)]">Check our <Link href="/faqs" className="text-sky-400 underline">FAQs</Link> or send us a message through the platform. You can also reach us at <a href="mailto:support@skydrop.co.nz" className="text-sky-400 underline">support@skydrop.co.nz</a>.</p>
          </div>
        </div>

      </div>
    </main>
  );
}
