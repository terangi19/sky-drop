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
      { q: "Is my payment protected?", a: "Yes — payments are processed through Stripe. Funds are held until you confirm delivery. If something goes wrong, you can report the seller." },
      { q: "Can I make an offer?", a: "If a seller has offers enabled, you'll see an 'Make Offer' button. Enter your offer and the seller can accept, decline, or counter." },
      { q: "How do I know when my item ships?", a: "The seller updates the order status in their Sales page. You'll see status changes (Confirmed → Shipped → Delivered) in your Purchases page." },
    ],
  },
  {
    section: "Selling",
    items: [
      { q: "How much does it cost to sell?", a: "Zero. Listing is free, selling is free. You only pay if you choose to promote a listing ($5 for 7 days of top placement)." },
      { q: "How do I get paid?", a: "When you mark an order as shipped, the funds are transferred to your connected Stripe account. Set up payouts in your Profile under 'Payout Settings'." },
      { q: "Can I edit or delete a listing?", a: "Yes — use the Edit button on your listing card or the listing detail page. The Remove button deletes it permanently." },
      { q: "What happens when a listing expires?", a: "Listings have a duration you choose when posting (7, 14, or 30 days). Expired listings show an 'Expired' badge and are hidden from search." },
      { q: "How do I promote my listing?", a: "On your listing detail page or homepage card, click '📈 Boost'. Pay $5 and your listing gets top placement in search for 7 days." },
    ],
  },
  {
    section: "Account",
    items: [
      { q: "How do I sign up?", a: "Click 'Get Started' on the homepage. Sign up with your email or Google account. Verify your email to start buying and selling." },
      { q: "How do I change my password?", a: "Go to your Profile page and scroll to the 'Security & Phone' section. Enter your current and new password, then click Update." },
      { q: "Can I delete my account?", a: "Yes — on your Profile page, scroll to the bottom. Type 'DELETE' and click Delete. This removes your profile and all data permanently." },
    ],
  },
  {
    section: "Safety",
    items: [
      { q: "How do I report a user or listing?", a: "On a seller's profile page, click 'Report'. On a listing, click 'Report listing' below the seller info. Select a reason and submit." },
      { q: "What should I do if a transaction goes wrong?", a: "First, message the seller through the platform. If that doesn't resolve it, report them and we'll review the case." },
      { q: "How do I spot a scam?", a: "Never pay outside Sky Drop. If someone asks for bank transfer, gift cards, or crypto, report them immediately. Our scam detection system also flags suspicious listings." },
      { q: "Can I block another user?", a: "Yes — go to their seller profile and click 'Block'. Blocked users can't message you." },
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


      </div>
    </main>
  );
}
