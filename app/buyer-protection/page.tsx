import Navbar from "../components/Navbar";
import Background from "../components/Background";
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

        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20">
          <span className="text-3xl">🛡️</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Buyer Protection</h1>
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Sky Drop is New Zealand's safest marketplace. Every transaction is protected by our escrow system, dispute resolution process, and secure payment infrastructure.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <FeatureCard icon="🔒" title="Escrow Protection" description="Your payment is held securely until you confirm delivery. The seller never receives your money until you're satisfied." />
          <FeatureCard icon="💳" title="Secure Payments" description="All payments are processed through Stripe, the world's leading payment processor. Your card details are never stored on our servers." />
          <FeatureCard icon="⚖️" title="Dispute Resolution" description="If something goes wrong, open a dispute within 7 days. An admin will review the case and issue a refund if appropriate." />
          <FeatureCard icon="✅" title="Verified Sellers" description="Sellers are reviewed and verified. Suspicious accounts are restricted and their listings removed." />
        </div>

        <h2 className="mt-16 text-2xl font-black">How Buyer Protection Works</h2>

        <div className="mt-6 space-y-6">
          <ProtectionStep number="1" title="You're in control" description="You only pay once. Funds are held in escrow — the seller can't access them until you confirm you've received the item as described." />
          <ProtectionStep number="2" title="Inspect before releasing" description="When the item arrives, check it thoroughly. Only confirm delivery in your Purchases page when you're happy with what you received." />
          <ProtectionStep number="3" title="7-day dispute window" description="If the item never arrives, is significantly different from the listing, or is damaged, open a dispute within 7 days. Your funds remain frozen until resolved." />
          <ProtectionStep number="4" title="Fair resolution" description="An admin reviews all evidence from both sides. If the seller is at fault, you get a full refund. If the seller is in the right, payment is released to them." />
        </div>

        <div className="mt-12 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-6">
          <h3 className="font-bold text-amber-400">⚠️ What's not covered</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>• Change of mind — always check the listing details before purchasing</li>
            <li>• Damage caused after delivery — inspect items immediately upon arrival</li>
            <li>• Disputes opened after the 7-day window</li>
            <li>• Items purchased outside of Sky Drop's platform</li>
          </ul>
        </div>

        <div className="mt-12 text-center">
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
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-lg">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-bold text-[var(--foreground)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{description}</p>
    </div>
  );
}

function ProtectionStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-black text-emerald-400">
        {number}
      </div>
      <div>
        <h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3>
        <p className="mt-0.5 text-sm text-[var(--muted)] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
