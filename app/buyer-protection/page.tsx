import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import Link from "next/link";

export default function BuyerProtectionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-sky-400 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Marketplace
        </Link>

        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/20">
          <span className="text-3xl">🛡️</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Buyer Protection</h1>
        <AwhinaUnderHeader className="mt-3" />
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Every transaction on Sky Drop is backed by Stripe-powered payments, dispute resolution, and a commitment to transparency about where we&apos;re at.
        </p>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">What&apos;s in place now</h2>

          <FeatureCard icon="💳" title="Payments through Stripe" description="All payments are processed by Stripe — a global payment provider. Stripe handles the processing, fraud detection, and security infrastructure." />
          <FeatureCard icon="⚖️" title="Dispute resolution" description="If something goes wrong, open a dispute within 7 days of delivery. An admin reviews the case and can issue a refund. If the seller is at fault, Stripe pulls the refund from their account." />
          <FeatureCard icon="📋" title="Verified seller profiles" description="Sellers must verify their email and connect a Stripe account to list items. New sellers have listing limits until they build a sales history. Suspicious accounts are reviewed." />
          <FeatureCard icon="🤖" title="Content scanning" description="Listings are automatically scanned for scam language, suspicious pricing, and prohibited items before going live. Images are checked through moderation tooling." />
          <FeatureCard icon="💬" title="Safe messaging" description="Our messaging system warns you if someone tries to take the conversation off-platform. Keep all communication on Sky Drop to stay protected." />
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">How disputes work</h2>

          <ProtectionStep number="1" title="You confirm or dispute" description="When the item arrives, inspect it. If everything looks good, confirm delivery to complete the order. If something's wrong, open a dispute within 7 days." />
          <ProtectionStep number="2" title="Dispute is reviewed" description="Once a dispute is opened, an admin reviews evidence from both sides — messages, photos, tracking info." />
          <ProtectionStep number="3" title="Refund issued if at fault" description="If the seller is at fault, a full refund is issued through Stripe's payment system." />
        </div>

        <div className="mt-12 rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] p-6">
          <h3 className="font-bold text-sky-400">⚠️ What's not covered</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>• Change of mind — always check the listing details before purchasing</li>
            <li>• Damage caused after delivery — inspect items immediately upon arrival</li>
            <li>• Disputes opened after the 7-day window</li>
            <li>• Items purchased outside of Sky Drop's platform</li>
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="font-bold text-white">💡 Start small</h3>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            Sky Drop is a new platform. We recommend starting with smaller transactions while we continue building out our protections. Our <Link href="/escrow" className="text-sky-400 underline">Payments & Protection page</Link> has a full roadmap of what we&apos;re working on next.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Browse Listings
          </Link>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/60 p-5 transition hover:border-zinc-700/50">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-lg">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ProtectionStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-xs font-black text-sky-400">
        {number}
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        <p className="mt-0.5 text-sm text-[var(--muted)] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
