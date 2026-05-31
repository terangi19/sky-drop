import Navbar from "../components/Navbar";
import Background from "../components/Background";
import Link from "next/link";

export default function SellerGuidelinesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-sky-400 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Marketplace
        </Link>

        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/20">
          <span className="text-3xl">📋</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Seller Guidelines</h1>
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Start selling on Sky Drop — New Zealand's safest marketplace. Here's everything you need to know about listing items, getting paid, and providing a great experience.
        </p>

        <Section title="Getting Started" icon="🚀">
          <p>Create a listing in under a minute using our AI assistant or manual form. Add clear photos, an accurate description, and set a fair price. All listings are reviewed for quality and safety.</p>
        </Section>

        <Section title="Fees" icon="💰">
          <p>Selling is <strong className="text-white">free to list</strong>. We charge a small processing fee on completed sales ($1.00 per transaction + Stripe processing fees). There are no subscription fees or hidden costs.</p>
        </Section>

        <Section title="Getting Paid" icon="🏦">
          <p>Connect your Stripe account from your Profile page. When a sale completes, funds are transferred to your connected Stripe account. Standard Stripe payout times apply (2-7 business days to your bank).</p>
          <p className="mt-2">You must connect Stripe before you can receive payouts — we'll remind you after your first listing is created.</p>
        </Section>

        <Section title="Listing Rules" icon="⚖️">
          <ul className="list-disc pl-5 space-y-1">
            <li>All items must be legal to buy and sell in New Zealand</li>
            <li>Listings must accurately represent the item — use real photos, not stock images</li>
            <li>Price must be in NZD and include all applicable taxes</li>
            <li>Prohibited items: weapons, drugs, counterfeit goods, stolen property, hazardous materials</li>
            <li>No duplicate listings for the same item</li>
          </ul>
        </Section>

        <Section title="Order Management" icon="📦">
          <p>When someone buys your item, you'll see it in your Sales page. Update the order status as you go:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong className="text-white">Confirm Order</strong> — acknowledge the purchase and prepare the item</li>
            <li><strong className="text-white">Mark Shipped</strong> — update when the item is dispatched (for physical goods)</li>
            <li><strong className="text-white">Communicate</strong> — use Messages to coordinate pickup or answer questions</li>
          </ul>
        </Section>

        <Section title="Escrow & Payouts" icon="🔒">
          <p>Every transaction uses our escrow system:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>The buyer's payment is held securely — you never handle payment directly</li>
            <li>Funds are released when the buyer confirms receipt (or automatically after 72 hours)</li>
            <li>If there's a dispute, funds are frozen until an admin resolves it</li>
            <li>You'll be notified at every step of the process</li>
          </ul>
        </Section>

        <Section title="Prohibited Conduct" icon="🚫">
          <ul className="list-disc pl-5 space-y-1">
            <li>No off-platform transactions — all payments must go through Sky Drop escrow</li>
            <li>No fake listings, bidding manipulation, or deceptive pricing</li>
            <li>No harassment, abuse, or spam in messages</li>
            <li>No sharing of personal contact info before a sale is confirmed</li>
            <li>Violations may result in account suspension or permanent ban</li>
          </ul>
        </Section>

        <Section title="Tips for Success" icon="⭐">
          <ul className="list-disc pl-5 space-y-1">
            <li>Take high-quality photos in good lighting — listings with photos sell 3x faster</li>
            <li>Respond to messages quickly — buyers appreciate fast communication</li>
            <li>Price competitively — check similar listings before setting your price</li>
            <li>Keep your listings updated — mark items as sold when they're gone</li>
            <li>Build your reputation — good reviews lead to more sales</li>
          </ul>
        </Section>

        <div className="mt-12 rounded-2xl border border-sky-500/15 bg-sky-500/[0.04] p-6 text-center">
          <h2 className="text-lg font-bold text-sky-400">Ready to start selling?</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Create your first listing in under a minute.</p>
          <Link href="/post/ai" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
            Create a Listing
          </Link>
        </div>
      </section>
    </main>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
      </div>
      <div className="text-sm text-[var(--muted)] leading-relaxed">{children}</div>
    </div>
  );
}
