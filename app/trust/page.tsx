"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";

const sections = [
  {
    title: "Account Progression",
    content:
      "New accounts start with limited selling capabilities and earn higher limits through successful sales and account age. This prevents scammers from abusing the platform.",
    items: [
      "Must have: verified email, verified mobile (one number per account), and either identity verification (licence or passport + selfie) or 30-day account age",
      "Account must be at least 30 days old before first listing (or complete identity verification)",
      "First listing: max $600, max 1 listing, hidden for 24 hours",
      "Message cap: 5 per day until you complete sales",
      "Maximum $500 total earnings across first 3 sales combined",
    ],
  },
  {
    title: "Selling Limits",
    content: "Identity verification may be required to unlock full selling capabilities. Your price cap increases as you earn positive reviews (rating 4+):",
    items: [
      "Identity verified: $5,000 starting cap · unlimited after 10 positive reviews · unlimited listings · ID Verified badge",
      "Without identity verification, selling limits may apply — verify your ID on Profile → Verification",
    ],
  },
  {
    title: "Identity Verification",
    content:
      "Upload photos of your driver's licence or passport (front and back) — that's all we need for identity verification. Phone verification is optional and adds a verified seller badge. Admin reviews manually.",
    items: [
      "Approved: list immediately, $5,000 starting cap (unlimited after 10 positive reviews), unlimited listings, +20 trust score",
      'Get an "ID Verified" badge on your profile and listings',
      "Your ID is stored securely with admin-only access",
      "If you commit fraud, your ID can be shared with law enforcement agencies where legally required",
      "Submitting fake or AI-generated ID = permanent ban with full forfeiture",
    ],
  },
  {
    title: "Trust Score",
    content:
      "Your trust score is a reputation badge that only goes up. Reports from other users never lower it — this prevents troll abuse. Serious violations are enforced separately through account restriction or banning (see below).",
    items: [
      "Email verified +10 · Profile complete +10 · 30 days old +10 · 90 days old +5 · First sale +10 · 10 sales +5 · Identity verified +20",
      "≥ 80 Trusted · ≥ 60 Good · ≥ 40 Average · < 40 Low",
      "Below 40: listings pushed down in search, no new listings until you verify your email or complete your profile. Accounts that violate our terms are restricted or banned by admins — not through the trust score.",
    ],
  },
  {
    title: "Bidding & Offers",
    content: "Rules to prevent fake activity on listings:",
    items: [
      "You cannot bid on or make offers on your own listings (server-side enforced)",
      "Bidding requires a verified phone number and account at least 30 days old",
      "Each bid stores your IP and device fingerprint for admin review if needed",
      'Bidders with no purchase history show a "New bidder" flag on the listing',
    ],
  },
  {
    title: "Automated Enforcement",
    content: "These actions happen automatically, no human review needed:",
    items: [
      "2+ reports on a listing in 24 hours → listing auto-removed (seller can relist)",
      "3+ reports on an account in 30 days → account restricted. Admin reviews and decides",
      "Sending scam-like messages to 3+ users in 1 hour → messaging restricted",
      "Re-listing an expired or removed item adds 24-hour delay each cycle",
      "Scam keywords in listings and messages are detected and blocked server-side",
    ],
  },
  {
    title: "Ban & Forfeiture",
    content:
      "When an account is banned for fraud, everything is wiped. This makes it not worth the effort for scammers to return.",
    items: [
      "Phone number blacklisted — can never be used on Sky Drop again",
      "All listings, reviews, XP, followers, and badges permanently deleted",
      "IP and device fingerprint get a 30-day cooldown before any new account can use them",
      "If the user completed identity verification: their identity documents are flagged and available as evidence where legally required",
    ],
  },
  {
    title: "Bot Prevention",
    content: "Automated checks at signup to stop bots and mass account creation:",
    items: [
      "Bot detection — invisible check on signup and first listing",
      "Honeypot field — hidden field that bots fill but humans can't see",
      "Timing check — form submitted in under 3 seconds is rejected",
      "Registration velocity — max 1 account per IP per 90 days",
      "Device fingerprinting — flags if the same device was recently banned",
    ],
  },
];

export default function TrustPage() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <div className="mt-8 text-center">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Trust & Safety</p>
          <h1 className="mt-1 text-3xl font-black text-[var(--foreground)]">How Sky Drop Keeps You Safe</h1>
          <AwhinaUnderHeader centered className="mt-3" />
          <p className="mt-2 text-sm text-[var(--muted)] max-w-xl mx-auto">
            Sky Drop uses a reputation-based system to prevent fraud. The more you sell, the more you unlock.
            Getting banned means losing everything — making it not worth the effort for scammers.
          </p>
        </div>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <h2 className="text-base font-black text-[var(--foreground)]">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{section.content}</p>
              {section.items.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[var(--muted)]">
                      <span className="mt-0.5 shrink-0 text-sky-400">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-sky-500/10 bg-sky-500/[0.03] p-6 text-center">
          <p className="text-sm text-[var(--muted)]">
            Questions? Contact{" "}
            <a href="mailto:support@skydrop.co.nz" className="text-sky-400 hover:underline">
              support@skydrop.co.nz
            </a>
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--muted)]">
          Last updated: June 2026
        </p>
      </section>
    </main>
  );
}
