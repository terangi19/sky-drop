import Navbar from "../components/Navbar";
import Background from "../components/Background";
import Link from "next/link";
import { Metadata } from "next";
import { V1_ARRANGE_SAFETY_ONE_LINER } from "../lib/conversation-safety";

export const metadata: Metadata = {
  title: "Stay Safe — Sky Drop NZ",
  description:
    "Sky Drop safety tips for New Zealand buyers and sellers. Message the seller, arrange purchase directly, meet in public, and verify items before paying.",
  keywords:
    "Sky Drop safety, meet safely NZ, marketplace tips, message seller, local buying NZ",
};

/** Public safety page — messaging-first. No Stripe / escrow / buyer-protection claims. */
export default function BuyerProtectionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted)] transition-colors hover:text-sky-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Marketplace
        </Link>

        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Stay safe on Sky Drop</h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
          Sky Drop is messaging-first. Browse a listing, message the seller, and arrange the purchase
          directly. We do not process online checkout or hold funds for marketplace deals.
        </p>

        <div className="mt-8 rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-5">
          <p className="text-sm font-semibold text-sky-400">How buying works</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Browse / Search → Listing → Message Seller → Agree in chat → Pay or meet outside Sky Drop.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{V1_ARRANGE_SAFETY_ONE_LINER}</p>
        </div>

        <div className="mt-10 space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Message the seller</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Use Messages to agree on price, pickup or delivery, and payment. Keep the conversation on
              Sky Drop so you both have a record.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Meet in public</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              For physical items, meet somewhere public and verify the item before paying. Do not share
              bank passwords or one-time codes.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">No platform payment processing</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Sky Drop does not hold funds, process listing payments, or guarantee refunds for deals you
              arrange with sellers. Report scams via Reports.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--soft-card)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Verified sellers</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Prefer sellers with identity verification. New sellers may have limits until they build
              history.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/messages" className="btn btn-primary">
            Open Messages
          </Link>
          <Link href="/" className="btn btn-secondary">
            Browse Listings
          </Link>
        </div>
      </section>
    </main>
  );
}
