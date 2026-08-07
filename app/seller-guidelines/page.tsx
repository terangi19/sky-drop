import Navbar from "../components/Navbar";
import Background from "../components/Background";
import Link from "next/link";
import { Metadata } from "next";
import { V1_ARRANGE_SAFETY_ONE_LINER } from "../lib/conversation-safety";

export const metadata: Metadata = {
  title: "Seller Guidelines — Sky Drop NZ",
  description:
    "How to sell on Sky Drop. Free to list. Buyers message you to arrange payment and pickup. Start selling cars, tech, fashion and more.",
  keywords:
    "seller guidelines, how to sell on Sky Drop, sell online NZ, free listings NZ, message seller, NZ marketplace",
};

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{children}</div>
    </section>
  );
}

export default function SellerGuidelinesPage() {
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

        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Seller Guidelines</h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
          Sell on Sky Drop by listing clearly and messaging buyers. Purchases are arranged directly in chat —
          not through online checkout.
        </p>

        <Section title="Getting started">
          <p>
            Create a listing with Āwhina or the manual form. Add clear photos, an honest description, and a fair
            NZD price. Identity verification is required before you can list.
          </p>
        </Section>

        <Section title="Fees">
          <p>
            Listing is <strong className="text-[var(--foreground)]">free</strong>. There are no subscription fees.
            Optional paid boosts may be available for top placement — fees are shown before you pay.
          </p>
          <p className="mt-2">
            Marketplace deals are messaging-first. Sky Drop does not charge Stripe-style processing fees on listing
            sales because we do not process those payments.
          </p>
        </Section>

        <Section title="Getting paid" id="arrange-payment">
          <p>
            Buyers tap <strong className="text-[var(--foreground)]">Message Seller</strong>. Agree on price,
            payment method, and pickup or delivery in Messages.
          </p>
          <p className="mt-2">{V1_ARRANGE_SAFETY_ONE_LINER}</p>
          <p className="mt-2">
            Optional: add bank account name and number in Profile so buyers can copy details in chat. Keep
            communication on Sky Drop so both of you have a record.
          </p>
        </Section>

        <Section title="Listing rules">
          <ul className="list-disc space-y-1 pl-5">
            <li>Items must be legal to buy and sell in New Zealand</li>
            <li>Use accurate photos and descriptions — no stock images for used goods</li>
            <li>Price in NZD</li>
            <li>No weapons, drugs, counterfeit or stolen goods, or other prohibited items</li>
            <li>No duplicate listings for the same item</li>
          </ul>
        </Section>

        <Section title="After someone messages you">
          <ul className="list-disc space-y-1 pl-5">
            <li>Reply promptly and keep agreements clear in chat</li>
            <li>Confirm pickup time/place or shipping details before payment</li>
            <li>For physical goods, meet in public when possible</li>
          </ul>
        </Section>

        <Section title="Prohibited conduct">
          <ul className="list-disc space-y-1 pl-5">
            <li>Do not pressure buyers to leave Sky Drop Messages before terms are agreed</li>
            <li>No fake listings, deceptive pricing, harassment, or spam</li>
            <li>Violations may result in suspension or permanent ban</li>
          </ul>
        </Section>

        <Section title="Tips">
          <ul className="list-disc space-y-1 pl-5">
            <li>Clear photos sell faster</li>
            <li>Respond quickly</li>
            <li>Be honest about condition and flaws</li>
          </ul>
        </Section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link href="/post/ai" className="btn btn-primary">
            Create a listing
          </Link>
          <Link href="/faqs" className="btn btn-secondary">
            FAQs
          </Link>
        </div>
      </section>
    </main>
  );
}
