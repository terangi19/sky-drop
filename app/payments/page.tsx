import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import Link from "next/link";

export default function PaymentsPage() {
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
          <span className="text-3xl">💳</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-center">How Payments Work</h1>
        <AwhinaUnderHeader centered />
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed text-center">
          Verified sellers. Direct payments.{" "}
          <strong className="text-white">Sky Drop never holds your money in a wallet.</strong>
        </p>

        <div className="mt-8 rounded-2xl border border-sky-500/25 bg-gradient-to-b from-sky-500/[0.08] to-transparent p-5 text-center">
          <p className="text-sm font-bold text-sky-400">No marketplace wallet</p>
          <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
            Card Checkout sends payments straight to the seller&apos;s connected payout account.
            Arrange Purchase is payment between you and the seller — bank transfer, cash, or pickup — with the deal kept on Sky Drop in Messages.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href="#card-checkout"
            className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-5 transition hover:border-sky-500/35"
          >
            <p className="text-sm font-bold text-sky-400">Card Checkout</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Buy Now — card payment goes direct to seller. $1 buyer protection fee. Disputes via Purchases.</p>
          </a>
          <a
            href="#arrange"
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 transition hover:border-emerald-500/35"
          >
            <p className="text-sm font-bold text-emerald-400">Arrange Purchase</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Purchase button — chat opens, you agree bank transfer, cash, pickup, etc.</p>
          </a>
        </div>

        <div id="card-checkout" className="mt-14 scroll-mt-24">
          <h2 className="text-2xl font-black text-white">Card Checkout</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            For listings set to <strong className="text-white">Card Checkout</strong> at post time. The seller must connect a payout account in Profile before buyers can pay.
            Money goes to the seller&apos;s connected account immediately — Sky Drop does not hold buyer funds.
          </p>

          <div className="mt-8 space-y-6">
            <Step number={1} title="Buyer taps Buy Now" description="Checkout opens in-app. A $1.00 buyer protection fee is added to the item price." />
            <Step number={2} title="Payment goes direct to the seller" description="Card details are processed securely by our payment provider. The payment is sent to the seller's connected payout account — not a Sky Drop balance." />
            <Step number={3} title="Order & messaging" description="A purchase record is created. Buyer and seller coordinate delivery in Messages." />
            <Step number={4} title="Disputes (card purchases)" description="If something goes wrong, open a dispute from Purchases within 7 days. Admins can issue refunds through our payment provider when appropriate." />
          </div>
        </div>

        <div id="arrange" className="mt-14 scroll-mt-24">
          <h2 className="text-2xl font-black text-white">Arrange Purchase</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            For listings set to <strong className="text-white">Arrange Purchase</strong> at post time. No payout account is required for the buyer or seller to complete the sale.
            Tapping <strong className="text-white">Purchase</strong> marks the listing sold and opens a chat so you can agree payment and delivery.
          </p>

          <div className="mt-8 space-y-6">
            <Step number={1} title="Buyer taps Purchase" description="You're connected to the seller in Messages. The listing is reserved as sold on Sky Drop." />
            <Step number={2} title="Agree terms in chat" description="Arrange bank transfer, cash on pickup, shipping, timing — keep the conversation on Sky Drop." />
            <Step number={3} title="Pay the seller directly" description="Payment happens off-platform (e.g. NZ bank transfer). Sky Drop does not process or hold these funds." />
            <Step number={4} title="If something goes wrong" description="Report via Reports with your Sky Drop chat history — we'll investigate and do our best to help you recover your money. Prefer ID-verified sellers; use Card Checkout when you want card payment and in-app disputes." />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-5">
            <p className="text-sm font-bold text-amber-400">Seller note</p>
            <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
              A connected payout account is only required for Card Checkout listings. Arrange Purchase listings can be sold without one.
            </p>
          </div>
        </div>

        <div className="mt-12 space-y-4">
          <h2 className="text-xl font-black text-white">Trust & protections</h2>

          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
            <div className="flex gap-3">
              <span className="text-xl shrink-0 mt-0.5">✅</span>
              <div>
                <h3 className="text-sm font-bold text-emerald-400">Verified sellers</h3>
                <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                  Sellers verify email and phone (one number per account). Optional ID verification adds an ID Verified badge. See <Link href="/trust" className="text-emerald-400/80 underline">Trust & Safety</Link> for full details.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
            <div className="flex gap-3">
              <span className="text-xl shrink-0 mt-0.5">💳</span>
              <div>
                <h3 className="text-sm font-bold text-emerald-400">Card Checkout</h3>
                <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                  Card payments are processed securely. Disputes on paid orders are reviewed by Sky Drop; refunds are issued through our payment provider when the seller is at fault.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
            <div className="flex gap-3">
              <span className="text-xl shrink-0 mt-0.5">💬</span>
              <div>
                <h3 className="text-sm font-bold text-emerald-400">Arrange Purchase</h3>
                <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">
                  Messaging stays on-platform so there is a record of what was agreed. If something goes wrong, report via Reports — we&apos;ll investigate and do our best to help you recover your payment. Prefer ID-verified sellers.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-bold text-white">Fees</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            Card Checkout: $1.00 buyer protection fee per purchase (plus standard card processing fees). Arrange Purchase: no Sky Drop payment fee — standard listing is free.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Browse Listings
          </Link>
        </div>
      </section>
    </main>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sm font-black text-sky-400">
        {number}
      </div>
      <div>
        <h3 className="text-base font-bold text-[var(--foreground)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
