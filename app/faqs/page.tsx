"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import ThemeToggle from "../components/ThemeToggle";

const faqs = [
  {
    section: "Āwhina — Sky Drop AI Assistant",
    items: [
      { q: "What is Āwhina?", a: "Āwhina is Sky Drop's built-in AI assistant. She can help you create listings, fill in listing details, estimate prices, answer questions about the platform, and guide you through buying and selling. You can chat with Āwhina from most pages on Sky Drop by tapping the chat bubble in the bottom-right corner." },
      { q: "What can Āwhina do?", a: "Āwhina can auto-fill listing forms for physical items, vehicles, digital products, services, and rentals. She can suggest fair NZD prices, rewrite descriptions in a natural Kiwi seller voice, and answer questions about Sky Drop's features, payments, and policies." },
      { q: "Does Āwhina store my conversations?", a: "Yes, if you're signed in, your conversations with Āwhina are saved so you can pick up where you left off. These are stored securely and are not shared with other users. You can start a new chat at any time." },
    ],
  },
  {
    section: "Buying",
    items: [
      { q: "How do I buy an item?", a: "Stripe listings: tap Buy Now and pay by card. Arrange Purchase listings: tap Purchase — you'll chat with the seller to agree payment (bank transfer, cash, pickup, etc.) and delivery." },
      { q: "What is Arrange Purchase?", a: "Sellers can list with Arrange Purchase instead of Stripe. You tap Purchase, the listing is marked sold, and you message the seller to agree how to pay and collect the item. Sky Drop does not process card payment for these sales." },
      { q: "How do I pay on Arrange Purchase?", a: "After you tap Purchase, open Messages. If the seller added bank details on their profile, you'll see account info with Copy buttons. Pay only after you agree pickup or shipping in chat. Sky Drop does not move the money." },
      { q: "Why keep conversations on Sky Drop?", a: "So there is a record of price, delivery, and what was promised. For Stripe Checkout, disputes are reviewed using Messages (open from Purchases within 7 days of delivery) — we cannot see SMS, WhatsApp, or email. For Arrange Purchase, payment is between you and the seller, but staying in chat still helps if you report a problem or need admin review." },
      { q: "Is my payment protected?", a: "Stripe Checkout: yes — card payment goes to the seller's Stripe account and you can open a dispute from Purchases within 7 days. Arrange Purchase: payment is between you and the seller off-platform; keep chat on Sky Drop and trade carefully." },
      { q: "How does Stripe Checkout work?", a: "Tapping Buy Now opens a secure Stripe checkout page where you pay by card. A $1 buyer protection fee is added at checkout. Funds go directly to the seller's connected Stripe Express account. Sky Drop does not hold buyer funds. Disputes are reviewed by admins; refunds go through Stripe when appropriate. For Arrange Purchase listings, payment (bank transfer, cash, etc.) is agreed in Messages and no Stripe fees apply." },
      { q: "What if the item doesn't arrive or is wrong?", a: "Stripe Checkout: open a dispute from Purchases within 7 days. Arrange Purchase: message the seller first; there is no card chargeback — choose Stripe listings when you want in-app payment protection." },
      { q: "Can I make an offer?", a: "If a seller has offers enabled, you'll see a 'Make Offer' button. Enter your offer and the seller can accept, decline, or counter." },
      { q: "How do I track my order?", a: "The seller updates the order status in their Sales page. You'll see status changes in your Purchases page: Pending → Confirmed → Shipped → Delivered. You can also message the seller directly." },
    ],
  },
  {
    section: "Selling",
    items: [
      { q: "How much does it cost to sell?", a: "Zero. Listing is free, selling is free. You only pay if you choose to promote a listing ($5 for 3 days of top placement)." },
      { q: "How do I get paid?", a: "Stripe Checkout listings: connect Stripe Express in Profile. Buyers pay by card; funds go to your Stripe account (typically 2–7 days to your bank). Arrange Purchase listings: agree payment in Messages — bank transfer, cash, etc. No Stripe required for those listings." },
      { q: "Do I need Stripe to sell?", a: "No. You can sell using Arrange Purchase without connecting Stripe. If you want to accept card payments through Stripe Checkout, you must connect a Stripe Express account in your Profile settings. Stripe Checkout and Arrange Purchase can be used independently." },
      { q: "How do I set up bank transfer for Arrange Purchase?", a: "Profile → Payment settings → add bank account name + number → Save bank details. When a buyer purchases, those details appear in Messages with copy buttons. Full steps: /seller-guidelines#arrange-payment" },
      { q: "Are there listing limits?", a: "Yes — new sellers can have up to 5 active listings. After 3 completed sales, the limit increases to 25. After 10 sales, there's no limit. This prevents spam and builds trust with buyers." },
      { q: "Can I edit or delete a listing?", a: "Yes — use the Edit button on your listing card or the listing detail page. The Remove button deletes it permanently." },
      { q: "What happens when a listing expires?", a: "Listings have a duration you choose when posting (7, 14, or 30 days). Expired listings show an 'Expired' badge and are hidden from search." },
      { q: "How do I promote my listing?", a: "On your listing detail page or homepage card, click '📈 Boost'. Pay $5 and your listing gets top placement in search for 7 days." },
    ],
  },
  {
    section: "Account & Verification",
    items: [
      { q: "How do I sign up?", a: "Go to /login?signup=1, or open Login and tap 'Need an account? Sign up'. Create an account with email and password. A verification email is sent right after signup. Phone number is optional — you can add and verify one later on your Profile." },
      { q: "Why do I need to provide a phone number?", a: "You don't have to at signup — phone is optional. Adding and verifying a phone on Profile helps prevent fake accounts and shows a Verified badge on your listings. Your number is stored securely and is not shared publicly." },
      { q: "Why do I need to verify my email and phone?", a: "Email verification helps secure your account and is required before buying. Phone verification is optional — it adds a Verified badge to your listings and profile. Identity verification is required before you can list items for sale." },
      { q: "What is seller identity verification?", a: "Identity verification is required before you can list items for sale. It helps prevent fraud and ensures buyers know they're dealing with real, accountable people." },
      { q: "What information do you store?", a: "We store information required to operate and secure the marketplace, including: profile information, email address, phone number, listings and listing images, messages sent through Sky Drop, transaction and order history, seller verification records, identity verification information (where applicable), and device, security, and fraud-prevention data. Payment information is processed securely by Stripe. Sky Drop does not store your full card details. For more information, please see our Privacy Policy." },
      { q: "How do I change my password?", a: "Go to your Profile page and scroll to the 'Security & Phone' section. Enter your current and new password, then click Update." },
      { q: "Can I delete my account?", a: "Yes — on your Profile page, scroll to the bottom. Type 'DELETE' and click Delete. This removes your profile and all data permanently." },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      { q: "How does Sky Drop prevent scams?", a: "Sky Drop uses multiple layers of protection including email verification, phone verification, seller verification, listing limits for new sellers, fraud monitoring, dispute review processes, and identity verification requirements for eligible sellers." },
      { q: "How do I report a user or listing?", a: "On a seller's profile page, click 'Report'. On a listing, click 'Report listing' below the seller info. Select a reason and submit. Reports are reviewed by an admin." },
      { q: "What should I do if a transaction goes wrong?", a: "Stripe Checkout: open a dispute within 7 days from your Purchases page. An admin will review evidence from both parties and, where appropriate, refunds will be processed through Stripe. Arrange Purchase: contact the seller through Messages first. While Arrange Purchase transactions are completed directly between buyer and seller, Sky Drop may review available evidence and take action against accounts that violate marketplace rules." },
      { q: "How do I spot a scam?", a: "On Stripe listings, only use Buy Now — never send gift cards or crypto to 'hold' an item. On Arrange Purchase, bank transfer after agreeing in chat is normal — but keep the conversation on Sky Drop. Report anyone pressuring you to pay before you've agreed terms in Messages." },
      { q: "Can I trust seller reviews?", a: "Only buyers who completed a transaction through Sky Drop can leave a review. This helps ensure reviews reflect genuine marketplace experiences and reduces fake or manipulated ratings." },
      { q: "Can I block another user?", a: "Yes — go to their seller profile and click 'Block'. Blocked users can't message you. View and manage blocked users at /blocked." },
      { q: "Messages or verification not working? Ad blockers", a: "Some browser extensions (uBlock Origin, AdGuard, Brave Shields, etc.) block Firebase requests and show ERR_BLOCKED_BY_CLIENT in the console. Sky Drop then cannot load messages, notifications, or save seller verification. Fix: disable the blocker for skydrop.co.nz, or whitelist firestore.googleapis.com, firebasestorage.googleapis.com, and identitytoolkit.googleapis.com. Seller verification uploads through our server when possible, so whitelisting skydrop.co.nz alone is usually enough." },
      { q: "What happens if someone commits fraud?", a: "Fraudulent activity is not tolerated. Accounts involved in scams, deception, or illegal activity may be permanently removed from the platform and may be referred to law enforcement agencies or other appropriate authorities where legally required." },
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
        <AwhinaUnderHeader className="mt-2" />
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
