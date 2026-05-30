import Navbar from "../components/Navbar";
import Background from "../components/Background";
import Link from "next/link";

export default function EscrowPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-sky-400 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Marketplace
        </Link>

        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20">
          <span className="text-3xl">🔒</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">How Escrow Works</h1>
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Every payment on Sky Drop is held securely in escrow. Neither the buyer nor the seller has direct access to the funds until the transaction is complete — protecting both sides from fraud.
        </p>

        <div className="mt-12 space-y-8">
          <Step number={1} title="Buyer Pays" description="The buyer pays the full amount via Stripe. Funds are immediately captured and held in Sky Drop's secure escrow account. The seller is notified that the order is placed." />
          <Step number={2} title="Seller Delivers" description="The seller prepares and sends the item (or provides the service). Once delivered, they mark the order as shipped or complete in their Sales dashboard." />
          <Step number={3} title="Buyer Confirms" description="The buyer inspects the item and confirms delivery. If everything is satisfactory, they click 'Confirm Receipt' to release the funds from escrow to the seller." />
          <Step number={4} title="Seller Gets Paid" description="Funds are transferred to the seller's connected Stripe account. The seller can then withdraw to their bank account. Standard Stripe payout times apply (usually 2-7 business days)." />
        </div>

        <div className="mt-12 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-6">
          <h2 className="text-lg font-bold text-amber-400">What if something goes wrong?</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            If the item doesn't arrive, isn't as described, or there's another issue, the buyer can open a dispute within 7 days of delivery. 
            An admin reviews the case and can either refund the buyer (funds returned) or release payment to the seller. 
            Funds are frozen in escrow until the dispute is resolved — neither party can access them.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] p-6">
          <h2 className="text-lg font-bold text-sky-400">Seller Auto-Release</h2>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            If the buyer doesn't confirm delivery within 72 hours after the seller marks it delivered, 
            funds are automatically released to the seller. This prevents buyers from holding funds hostage.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Start Shopping
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
