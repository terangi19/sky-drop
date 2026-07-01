import Navbar from "../components/Navbar";
import Background from "../components/Background";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buyer Protection — Sky Drop NZ",
  description: "Sky Drop buyer protection for secure online shopping in New Zealand. Stripe Checkout with dispute resolution, identity verification, and fraud protection. Shop safely on NZ's community marketplace.",
  keywords: "buyer protection, safe online shopping NZ, secure payments, dispute resolution, Sky Drop protection, NZ marketplace safety",
};

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
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Transactions completed through Stripe Checkout are protected by Sky Drop&apos;s dispute process, identity verification requirements, and fraud prevention systems.
        </p>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">What&apos;s in place now</h2>

          <FeatureCard icon="💳" title="Payments through Stripe" description="Stripe Checkout purchases are processed by Stripe — a global payment provider. Stripe handles the processing, fraud detection, and security infrastructure. Your payment details are never stored by Sky Drop. For Arrange Purchase listings, payment methods (bank transfer, cash, etc.) are agreed directly in Messages." />
          <TrustCard />
          <FeatureCard icon="⚖️" title="Dispute resolution (Stripe Checkout)" description="If something goes wrong with a Stripe Checkout purchase, open a dispute within 7 days of delivery. An admin reviews evidence from both sides — messages, photos, tracking info. If the seller is at fault, a full refund is issued through Stripe. Arrange Purchase transactions are handled directly between the buyer and seller." />
          <FeatureCard icon="📋" title="Verified seller profiles" description="Sellers are required to verify their identity before listing. New sellers have listing limits until they build a sales history. Suspicious or unverified accounts are restricted." />
          <FeatureCard icon="🤖" title="Content monitoring" description="Listings may be reviewed for prohibited items, suspicious activity, and marketplace policy violations. Attempting to list prohibited or fraudulent items may result in account removal." />
          <FeatureCard icon="💬" title="Safe messaging" description="Our messaging system warns you if someone tries to take the conversation off-platform. Keeping all communication on Sky Drop helps maintain a clear record if a dispute occurs." />
          <FeatureCard icon="👮" title="Fraud reporting" description="Fraudulent activity is not tolerated on Sky Drop. Accounts involved in scams, deception, chargeback abuse, impersonation, or other dishonest behaviour may be permanently removed from the platform, have listings removed, and may be referred to law enforcement agencies or other appropriate authorities where legally required." />
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">How disputes work (Stripe Checkout)</h2>

          <ProtectionStep number="1" title="You confirm or dispute" description="When the item or service is delivered, inspect it. If everything looks good, confirm to complete the order. If something's wrong, open a dispute within 7 days." />
          <ProtectionStep number="2" title="Dispute is reviewed" description="An admin reviews evidence from both sides — messages, photos, tracking info, and any other relevant records. All communication on Sky Drop is logged." />
          <ProtectionStep number="3" title="Refund issued if at fault" description="If the seller is at fault, a full refund is issued back to your original payment method through Stripe. Fraudulent accounts may also be referred to appropriate authorities where legally required." />
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">Protection by listing type</h2>

          <FeatureCard icon="📦" title="Physical items" description="Pay with Stripe Checkout for dispute protection. If the item doesn't arrive or isn't as described, open a dispute within 7 days. Arrange Purchase is also available — payment is agreed directly between buyer and seller in Messages." />
          <FeatureCard icon="💾" title="Digital products" description="Digital downloads are delivered instantly after payment via Stripe Checkout. If the file is faulty or doesn't match the description, open a dispute within 7 days. For custom digital work with Quote Required pricing, discuss scope in Messages before purchasing." />
          <FeatureCard icon="🛠️" title="Services" description="For local services, discuss the scope in Messages first. Complete payment through Stripe Checkout or Arrange Purchase. If the work isn't completed as agreed, open a dispute within 7 days." />
          <FeatureCard icon="🔑" title="Rentals" description="Rental listings include daily, weekly, or monthly rates. Rental agreements and deposits are managed between the renter and owner through Messages." />
          <FeatureCard icon="🚗" title="Vehicles" description="Vehicle purchases typically use Arrange Purchase (bank transfer). We recommend inspecting the vehicle in person before completing payment. All sellers are identity verified." />
        </div>

        <div className="mt-12 rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] p-6">
          <h3 className="font-bold text-sky-400">⚠️ What&apos;s not covered</h3>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>• Change of mind — always check the listing details before purchasing</li>
            <li>• Damage caused after delivery or collection</li>
            <li>• Disputes opened after the 7-day window</li>
            <li>• Payments made without a Sky Drop order</li>
            <li>• Transactions where Sky Drop cannot verify what was agreed between the buyer and seller</li>
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-6">
          <h3 className="font-bold text-amber-400">🤝 Arrange Purchase Support</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Arrange Purchase transactions are completed directly between the buyer and seller. While these purchases are not covered by Stripe&apos;s payment protection, Sky Drop will still review reports of fraud, scams, misleading listings, and marketplace abuse.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            We encourage all communication to remain on Sky Drop so evidence can be reviewed if a problem occurs. Where possible, we will work with both parties to help resolve disputes fairly and take action against users who violate our marketplace rules.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            While refunds cannot be guaranteed for Arrange Purchase transactions, we will always do our best to investigate issues and support honest buyers and sellers.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="font-bold text-white">💡 Start small</h3>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            Sky Drop is a new platform. We recommend starting with smaller transactions while we continue building out our protections. Stripe Checkout purchases are backed by our dispute process.
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

function TrustCard() {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] via-sky-500/[0.02] to-transparent p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 shadow-[0_0_16px_rgba(14,165,233,0.12)]">
          <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--foreground)]">Identity Verification</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
            Sellers can complete identity verification to unlock immediate selling access. Accounts that do not complete verification may be subject to seller restrictions and waiting periods. Verification helps ensure users are dealing with real, accountable people and creates a safer marketplace for everyone.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Sky Drop takes fraud, scams, and deceptive activity seriously. Accounts found to be involved in fraudulent behaviour may be permanently removed from the platform, have listings removed, and may be subject to further action where required by law.
          </p>
          <p className="mt-2 text-sm font-semibold text-sky-400">
            Honest sellers have nothing to worry about. If you&apos;re here to scam people, Sky Drop is not the platform for you.
          </p>
        </div>
      </div>
    </div>
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
