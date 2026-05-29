"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

const faqs = [
  {
    section: "Buying",
    items: [
      { q: "How do I buy an item?", a: "Find a listing you like, click 'Buy Now' to pay securely through Stripe, then message the seller to arrange pickup or shipping." },
      { q: "Is my payment protected?", a: "Yes — your money is held in escrow by Sky Drop. The seller only receives the funds after you confirm delivery. If something goes wrong, open a dispute within 7 days for a full refund." },
      { q: "How does escrow work?", a: "When you pay, funds go into a protected account. The seller sees the order but can't access the money until you confirm receipt. Once you click 'Confirm Received' on your Purchases page, the seller can release the funds to their account. You have 14 days to confirm — after that it auto-confirms." },
      { q: "What if the item doesn't arrive or is wrong?", a: "Open a dispute from your Purchases page within 7 days of delivery. An admin reviews the case and can issue a full refund. Don't confirm delivery until you're satisfied — once confirmed, funds are released to the seller." },
      { q: "Can I make an offer?", a: "If a seller has offers enabled, you'll see a 'Make Offer' button. Enter your offer and the seller can accept, decline, or counter." },
      { q: "How do I track my order?", a: "The seller updates the order status in their Sales page. You'll see status changes in your Purchases page: Pending → Confirmed → Shipped → Delivered. You can also message the seller directly." },
    ],
  },
  {
    section: "Selling",
    items: [
      { q: "How much does it cost to sell?", a: "Zero. Listing is free, selling is free. You only pay if you choose to promote a listing ($5 for 3 days of top placement)." },
      { q: "How do I get paid?", a: "First, connect a Stripe Express account in your Profile under 'Payout Settings'. When a buyer confirms delivery, go to your Sales page and click '💰 Release Funds'. The money transfers to your Stripe account. Funds also auto-release after 24 hours in 'Delivered' status." },
      { q: "Why are funds held after delivery?", a: "This is our escrow system — it protects both buyers and sellers. The buyer verifies they received the item before funds are released. This prevents chargebacks and builds trust. Once confirmed, funds are available immediately." },
      { q: "Are there listing limits?", a: "Yes — new sellers can have up to 5 active listings. After 3 completed sales, the limit increases to 25. After 10 sales, there's no limit. This prevents spam and builds trust with buyers." },
      { q: "Can I edit or delete a listing?", a: "Yes — use the Edit button on your listing card or the listing detail page. The Remove button deletes it permanently." },
      { q: "What happens when a listing expires?", a: "Listings have a duration you choose when posting (7, 14, or 30 days). Expired listings show an 'Expired' badge and are hidden from search." },
      { q: "How do I promote my listing?", a: "On your listing detail page or homepage card, click '📈 Boost'. Pay $5 and your listing gets top placement in search for 7 days." },
    ],
  },
  {
    section: "Account",
    items: [
      { q: "How do I sign up?", a: "Click 'Get Started' on the homepage. Sign up with your email or Google account. You must verify your email before you can list items or make purchases." },
      { q: "Why do I need to verify my email?", a: "Email verification is required to prevent fake accounts and scams. It protects both buyers and sellers by ensuring everyone on the platform is a real person." },
      { q: "How do I change my password?", a: "Go to your Profile page and scroll to the 'Security & Phone' section. Enter your current and new password, then click Update." },
      { q: "Can I delete my account?", a: "Yes — on your Profile page, scroll to the bottom. Type 'DELETE' and click Delete. This removes your profile and all data permanently." },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      { q: "How does Sky Drop prevent scams?", a: "We use multiple layers of protection: every listing is scanned for scam language and suspicious pricing before going live, sellers must verify their email, new sellers have listing limits, and all payments use escrow. Our messaging system also warns you if someone tries to take the conversation off-platform." },
      { q: "How do I report a user or listing?", a: "On a seller's profile page, click 'Report'. On a listing, click 'Report listing' below the seller info. Select a reason and submit. Reports are reviewed by an admin." },
      { q: "What should I do if a transaction goes wrong?", a: "First, message the seller through the platform. If that doesn't resolve it, open a dispute from your Purchases page within 7 days. An admin reviews the case and can issue a full refund from escrow." },
      { q: "How do I spot a scam?", a: "Never pay outside Sky Drop. If someone asks for bank transfer, gift cards, or crypto, report them immediately. Keep all communication on the platform — our messaging system will warn you if it detects risky keywords like phone numbers or email addresses." },
      { q: "Can I trust seller reviews?", a: "Yes — only verified buyers who actually purchased the item can leave a review. This prevents fake reviews and ensures ratings reflect real experiences. Reviews can't be edited after submission." },
      { q: "Can I block another user?", a: "Yes — go to their seller profile and click 'Block'. Blocked users can't message you. You can manage blocked users in your Messages settings." },
      { q: "What information do you store?", a: "We store your profile info, listings, messages, and transaction history. All payments are handled by Stripe — we never store your card details. See our Privacy Policy for full details." },
    ],
  },
];

export default function FAQsPage() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><ThemeToggle />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60 mb-6">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </Link>
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Help</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">Frequently Asked Questions</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Everything you need to know about buying and selling on Sky Drop.</p>

        <div className="mt-8 space-y-8">
          {faqs.map((section) => (
            <div key={section.section}>
              <h2 className="text-sm font-bold text-[var(--foreground)] mb-3">{section.section}</h2>
              <div className="space-y-2">
                {section.items.map((faq) => (
                  <details key={faq.q} className="group rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                    <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold text-[var(--foreground)] transition hover:bg-zinc-800/30">
                      {faq.q}
                      <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <p className="border-t border-zinc-800/50 px-4 py-3 text-sm text-[var(--muted)] leading-relaxed">{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center">
          <h2 className="text-sm font-bold text-[var(--foreground)]">Still have questions?</h2>
          <p className="mt-2 text-xs text-[var(--muted)]">Check our <Link href="/about" className="text-sky-400 underline">About page</Link> for more details on how Sky Drop protects you.</p>
        </div>

      </div>
    </main>
  );
}
