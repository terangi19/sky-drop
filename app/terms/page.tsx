"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

const sections = [
  {
    id: "intro",
    title: "Introduction",
    content:
      "Sky Drop is a New Zealand online marketplace that connects buyers and sellers. By using this platform, you agree to these terms. If you don't agree, please don't use the site. We may update these terms from time to time, and continued use means you accept any changes.",
  },
  {
    id: "accounts",
    title: "Accounts",
    content:
      "You're responsible for keeping your account secure. Don't share your password or let anyone else use your account. You must be at least 18 years old to use Sky Drop. We reserve the right to suspend or close accounts that violate these terms or engage in suspicious or fraudulent activity.",
  },
  {
    id: "fraud",
    title: "Fraud & Illegal Activity",
    content:
      "Sky Drop has a zero-tolerance policy for scams, fraud, and illegal activity. Any user found attempting to defraud, deceive, or harm other users — including chargeback fraud, fake listings, non-delivery after payment, or any other dishonest behaviour — will have their account permanently removed from the platform. Such accounts may also be referred to law enforcement agencies or other appropriate authorities where legally required. By using Sky Drop, you consent to your transaction records, messages, and account information being shared in connection with investigations into fraudulent or illegal activity.",
  },
  {
    id: "listings",
    title: "Listings & Sales",
    content:
      "Listings must be accurate and describe the item honestly. Include clear photos, a fair price, and the correct condition. You may not list items you don't own or have permission to sell. All sales are between the buyer and seller — Sky Drop facilitates the connection but is not a party to the transaction.",
  },
  {
    id: "payments",
    title: "Payments",
    content:
      "Payments are processed through Stripe and sent directly to the seller's Stripe account. Sky Drop only receives a platform fee per transaction. Optional upgrades (like promoted listings) may incur a fee, which is clearly shown before purchase. All payment disputes and refunds are handled directly with Stripe according to their policies. Any attempt to manipulate payments, commit chargeback fraud, or bypass the platform's payment system is strictly prohibited and will be reported to law enforcement.",
  },
  {
    id: "prohibited",
    title: "Prohibited Items",
    content:
      "Weapons, explosives, illegal drugs, stolen goods, counterfeit items, and anything that violates New Zealand law is banned from Sky Drop. We also prohibit dangerous items, adult content, and anything we reasonably consider harmful to the community. Listings found in violation will be removed without notice and reported to authorities where required.",
  },
  {
    id: "disputes",
    title: "Disputes & Reports",
    content:
      "If something goes wrong, try to resolve it directly with the other party first. If you can't reach an agreement, contact Sky Drop support and we'll help mediate. We may step in to resolve disputes at our discretion, including issuing refunds or suspending accounts where necessary. All disputes are logged and may be used as evidence in the event of fraud or legal proceedings. Users who repeatedly receive verified reports of scam attempts will be permanently banned.",
  },
  {
    id: "liability",
    title: "Limitation of Liability",
    content:
      "Sky Drop is provided 'as is' and we make no guarantees about the platform's availability or the behaviour of its users. To the extent permitted by New Zealand law, we are not liable for any loss or damage arising from your use of the site, including failed transactions, misrepresented items, or disputes between users. This does not limit our right to pursue legal action against fraudulent users.",
  },
];

function SectionCard({ num, title, content, id }: { num: number; title: string; content: string; id: string }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sm font-black text-sky-400">
          {num}
        </span>
        <div>
          <h2 className="text-base font-black text-[var(--foreground)]">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{content}</p>
        </div>
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />
      <Navbar />
      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-12">

        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-[var(--foreground)] transition hover:border-zinc-700 hover:bg-zinc-800/60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>

        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Legal</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">Terms of Service</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            The rules that govern your use of Sky Drop.
          </p>
        </div>

        {/* Table of contents */}
        <nav className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Jump to</p>
          <ul className="space-y-1.5">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-center gap-3 text-sm text-sky-400 transition hover:text-sky-300"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-5">
          {sections.map((section, i) => (
            <SectionCard key={section.id} num={i + 1} title={section.title} content={section.content} id={section.id} />
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-[var(--muted)]">
          Last updated: June 2026
        </p>
      </section>

    </main>
  );
}
