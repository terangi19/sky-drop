"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import { useEffect } from "react";

const faqs = [
  {
    section: "Āwhina — Sky Drop AI Assistant",
    items: [
      { q: "What is Āwhina?", a: "Āwhina is Sky Drop's built-in AI assistant. She can help you create listings, fill in listing details, estimate prices, answer questions about the platform, and guide you through buying and selling. You can chat with Āwhina from most pages on Sky Drop by tapping the chat bubble in the bottom-right corner." },
      { q: "What can Āwhina do?", a: "Āwhina can auto-fill listing forms for physical items, vehicles, digital products, services, and rentals. She can suggest fair NZD prices, rewrite descriptions in a natural Kiwi seller voice, and answer questions about Sky Drop's features and policies." },
      { q: "Does Āwhina store my conversations?", a: "Yes, if you're signed in, your conversations with Āwhina are saved so you can pick up where you left off. These are stored securely and are not shared with other users. You can start a new chat at any time." },
    ],
  },
  {
    section: "Buying",
    items: [
      { q: "How do I buy an item?", a: "Open a listing and tap Message Seller. Agree on price, pickup or delivery, and how you'll pay in chat. Sky Drop does not process card checkout for marketplace listings — you arrange payment directly with the seller." },
      { q: "How do I pay?", a: "Agree payment in Messages (bank transfer, cash on pickup, etc.). Only pay after you've agreed terms and, for physical items, verified the item when meeting. Sky Drop does not hold or move the money." },
      { q: "Why keep conversations on Sky Drop?", a: "So you both have a record of price, delivery, and what was promised. We cannot see SMS, WhatsApp, or email. Keeping chat here helps if you need to report a problem." },
      { q: "Does Sky Drop protect my payment?", a: "No. Sky Drop does not process listing payments, hold funds, or guarantee refunds. Trade carefully: meet in public, verify the item before paying, and never share bank passwords or one-time codes." },
      { q: "What if the item doesn't arrive or is wrong?", a: "Message the seller first and try to resolve it. You can report the listing or user if you believe marketplace rules were broken. There is no card chargeback through Sky Drop for messaging-first deals." },
      { q: "Can I make an offer?", a: "If a seller has offers enabled, you can discuss price in Messages. Agree any change clearly in chat before paying." },
      { q: "Where do I see past orders?", a: "Past purchase and sale records (if you have any) remain available via direct links from your account menu. New deals are arranged in Messages." },
    ],
  },
  {
    section: "Selling",
    items: [
      { q: "How much does it cost to sell?", a: "Zero. Listing is free, selling is free. You only pay if you choose to promote a listing ($5 for top placement)." },
      { q: "How do I get paid?", a: "Agree payment with the buyer in Messages — bank transfer, cash on pickup, or another method you both accept. Sky Drop does not process marketplace payments." },
      { q: "Do I need a payment account to sell?", a: "No. Message buyers, agree terms in chat, and arrange payment directly. Optional bank details on your profile can make Arrange Purchase conversations easier." },
      { q: "How do I share bank details?", a: "Profile → Payment settings → add bank account name + number if you want buyers to see copyable details in chat. Full tips: /seller-guidelines" },
      { q: "Are there listing limits?", a: "Yes — new sellers can have up to 5 active listings. After 3 completed sales, the limit increases to 25. After 10 sales, there's no limit. This prevents spam and builds trust with buyers." },
      { q: "Can I edit or delete a listing?", a: "Yes — use the Edit button on your listing card or the listing detail page. The Remove button deletes it permanently." },
      { q: "What happens when a listing expires?", a: "Listings have a duration you choose when posting (7, 14, or 30 days). Expired listings show an 'Expired' badge and are hidden from search." },
      { q: "How do I promote my listing?", a: "On your listing detail page or homepage card, use Boost for paid top placement when that feature is available." },
    ],
  },
  {
    section: "Account & Verification",
    items: [
      { q: "How do I sign up?", a: "Go to /login?signup=1, or open Login and tap 'Need an account? Sign up'. Create an account with email and password. A verification email is sent right after signup. Phone number is optional — you can add and verify one later on your Profile." },
      { q: "Why do I need to provide a phone number?", a: "You don't have to at signup — phone is optional. Adding and verifying a phone on Profile helps prevent fake accounts and shows a Verified badge on your listings. Your number is stored securely and is not shared publicly." },
      { q: "Why do I need to verify my email and phone?", a: "Email verification helps secure your account and is required before buying. Phone verification is optional — it adds a Verified badge to your listings and profile. Identity verification is required before you can list items for sale." },
      { q: "What is seller identity verification?", a: "Identity verification is required before you can list items for sale. It helps prevent fraud and ensures buyers know they're dealing with real, accountable people." },
      { q: "What information do you store?", a: "We store information required to operate and secure the marketplace, including: profile information, email address, phone number, listings and listing images, messages sent through Sky Drop, any order history you have, seller verification records, identity verification information (where applicable), and device, security, and fraud-prevention data. For more information, please see our Privacy Policy." },
      { q: "How do I change my password?", a: "Go to your Profile page and scroll to the 'Security & Phone' section. Enter your current and new password, then click Update." },
      { q: "Can I delete my account?", a: "Yes — on your Profile page, scroll to the bottom. Type 'DELETE' and click Delete. This removes your profile and all data permanently." },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      { q: "How does Sky Drop prevent scams?", a: "Sky Drop uses email verification, phone verification, seller verification, listing limits for new sellers, fraud monitoring, and identity verification for eligible sellers. Marketplace deals are arranged between buyers and sellers — always meet safely and verify items before paying." },
      { q: "How do I report a user or listing?", a: "On a seller's profile page, click 'Report'. On a listing, click 'Report listing' below the seller info. Select a reason and submit. Reports are reviewed by an admin." },
      { q: "What should I do if a deal goes wrong?", a: "Contact the seller through Messages first. If rules were broken (scam, abuse, fake listing), report the user or listing. Sky Drop may review available evidence and take action against accounts that violate marketplace rules, but we do not process refunds for off-platform payments." },
      { q: "How do I spot a scam?", a: "Never send gift cards or crypto to 'hold' an item. Keep the conversation on Sky Drop. Meet in public for physical goods. Report anyone pressuring you to pay before you've agreed terms in Messages, or asking you to move to WhatsApp/SMS immediately." },
      { q: "Can I trust seller reviews?", a: "Only buyers who completed a supported transaction record on Sky Drop can leave a review where that feature is available. This helps reduce fake ratings." },
      { q: "Can I block another user?", a: "Yes — go to their seller profile and click 'Block'. Blocked users can't message you. View and manage blocked users at /blocked." },
      { q: "Messages or verification not working? Ad blockers", a: "Some browser extensions (uBlock Origin, AdGuard, Brave Shields, etc.) block Firebase requests and show ERR_BLOCKED_BY_CLIENT in the console. Sky Drop then cannot load messages, notifications, or save seller verification. Fix: disable the blocker for skydrop.co.nz, or whitelist firestore.googleapis.com, firebasestorage.googleapis.com, and identitytoolkit.googleapis.com. Seller verification uploads through our server when possible, so whitelisting skydrop.co.nz alone is usually enough." },
      { q: "What happens if someone commits fraud?", a: "Fraudulent activity is not tolerated. Accounts involved in scams, deception, or illegal activity may be permanently removed from the platform." },
    ],
  },
];

export default function FAQsPage() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar /><div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
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
