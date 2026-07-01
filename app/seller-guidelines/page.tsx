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

        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/20">
          <span className="text-3xl">📋</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">Seller Guidelines</h1>
        <p className="mt-4 text-lg text-[var(--muted)] leading-relaxed">
          Start selling on Sky Drop — New Zealand's community marketplace. Here's everything you need to know about listing items, getting paid, and providing a great experience.
        </p>

        <Section title="Getting Started" icon="🚀">
          <p>Create a listing in under a minute using our AI assistant or manual form. Add clear photos, an accurate description, and set a fair price. All listings are reviewed for quality and safety.</p>
        </Section>

        <Section title="Fees" icon="💰">
          <p>Selling is <strong className="text-white">free to list</strong>. There are no subscription fees or hidden costs.</p>
          <p className="mt-2">For purchases completed through <strong className="text-white">Stripe Checkout</strong>, a $1.00 buyer protection fee is added to help cover dispute resolution and platform operations. Standard Stripe payment processing fees also apply.</p>
          <p className="mt-2"><strong className="text-white">Arrange Purchase</strong> transactions do not incur Stripe processing fees and are handled directly between the buyer and seller. Payment methods like bank transfer, cash, or in-person payment are agreed in Messages.</p>
        </Section>

        <Section title="Getting Paid" icon="🏦">
          <p>When creating a listing, choose how buyers pay:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong className="text-white">Stripe Checkout</strong> — buyers pay by card. Connect Stripe Express in Profile so payouts go <strong className="text-white">directly to your Stripe account</strong> (2–7 business days to your bank).</li>
            <li><strong className="text-white">Arrange Purchase</strong> — buyers tap Purchase and chat with you. You agree bank transfer, cash, pickup, etc. <strong className="text-white">No Stripe required</strong> for this listing type.</li>
          </ul>
          <p className="mt-2">
            For Arrange Purchase, add bank details in Profile first — see{" "}
            <a href="#arrange-payment" className="text-sky-400 underline hover:text-sky-300">bank transfer setup</a> below.
          </p>
          <p className="mt-2">We remind you to connect Stripe after your first <em>Stripe Checkout</em> listing — not needed for Arrange Purchase only.</p>
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

        <Section title="Payments" icon="💳">
          <p><strong className="text-white">Stripe Checkout listings:</strong></p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Buyer pays via Buy Now; funds go to your Stripe Express account</li>
            <li>$1 buyer protection fee per sale; Stripe charges standard processing</li>
            <li>Disputes on Purchases can result in refunds through Stripe</li>
          </ul>
          <p className="mt-3"><strong className="text-white">Arrange Purchase listings:</strong></p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Buyer taps Purchase; you arrange payment in Messages</li>
            <li>Sky Drop does not process card payments for these sales</li>
            <li>Keep all communication on Sky Drop Messages — admins use chat history for Stripe disputes and reports</li>
          </ul>
        </Section>

        <Section title="Arrange Purchase — bank transfer" icon="🏦" id="arrange-payment">
          <p className="text-zinc-400">Set up once so buyers are not lost after they tap Purchase.</p>
          <ol className="list-decimal pl-5 mt-3 space-y-2 text-sm">
            <li>Open <strong className="text-white">Profile</strong> (menu → your username).</li>
            <li>Scroll to <strong className="text-white">Payment settings</strong>.</li>
            <li>Under <strong className="text-white">Arrange Purchase — bank transfer</strong>, add your <strong className="text-white">bank account name</strong> and <strong className="text-white">account number</strong> (NZ format).</li>
            <li>Click <strong className="text-white">Save bank details</strong> in Payment settings (or Save changes at the top of Profile).</li>
            <li>When you create a listing, choose <strong className="text-white">Arrange Purchase</strong> as payment type.</li>
          </ol>
          <p className="mt-4 text-sm text-zinc-400"><strong className="text-white">When a buyer purchases:</strong></p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>They see your bank details in <strong className="text-white">Messages</strong> with copy buttons.</li>
            <li>Agree pickup or shipping in chat before they pay.</li>
            <li>Mark the sale confirmed from <strong className="text-white">Sales</strong> when done.</li>
            <li>Keep the whole deal in <strong className="text-white">Messages</strong> — not SMS or social — so there is a record if someone reports a problem.</li>
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Stripe Connect is not required for Arrange Purchase. Stripe Checkout disputes use Messages as evidence (buyer opens from Purchases within 7 days).</p>
        </Section>

        <Section title="Prohibited Conduct" icon="🚫">
          <ul className="list-disc pl-5 space-y-1">
            <li>For Stripe listings, buyers must use Buy Now — do not ask for off-platform card payments</li>
            <li>For Arrange Purchase listings, agree payment in Messages — stay on Sky Drop so there is a record if either side reports a problem</li>
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

function Section({
  title,
  icon,
  id,
  children,
}: {
  title: string;
  icon: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="mt-10 scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
      </div>
      <div className="text-sm text-[var(--muted)] leading-relaxed">{children}</div>
    </div>
  );
}
