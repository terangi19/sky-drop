"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";

const sections = [
  {
    title: "Introduction",
    content:
      "Sky Drop is a New Zealand online marketplace that connects buyers and sellers. By using this platform, you agree to these terms. If you don't agree, please don't use the site. We may update these terms from time to time, and continued use means you accept any changes.",
  },
  {
    title: "Accounts",
    content:
      "You're responsible for keeping your account secure. Don't share your password or let anyone else use your account. You must be at least 18 years old to use Sky Drop. We reserve the right to suspend or close accounts that violate these terms or engage in suspicious activity.",
  },
  {
    title: "Listings & Sales",
    content:
      "Listings must be accurate and describe the item honestly. Include clear photos, a fair price, and the correct condition. You may not list items you don't own or have permission to sell. All sales are between the buyer and seller — Sky Drop facilitates the connection but is not a party to the transaction.",
  },
  {
    title: "Payments",
    content:
      "Payments are processed through our integrated payment system. Funds are held securely until the buyer confirms receipt or the holding period expires. Optional upgrades (like promoted listings) may incur a fee, which is clearly shown before purchase. Refunds and disputes are handled between buyer and seller in good faith.",
  },
  {
    title: "Prohibited Items",
    content:
      "Weapons, explosives, illegal drugs, stolen goods, counterfeit items, and anything that violates New Zealand law is banned from Sky Drop. We also prohibit dangerous items, adult content, and anything we reasonably consider harmful to the community. Listings found in violation will be removed without notice.",
  },
  {
    title: "Disputes",
    content:
      "If something goes wrong, try to resolve it directly with the other party first. If you can't reach an agreement, contact Sky Drop support and we'll help mediate. We may step in to resolve disputes at our discretion, including issuing refunds or suspending accounts where necessary.",
  },
  {
    title: "Limitation of Liability",
    content:
      "Sky Drop is provided 'as is' and we make no guarantees about the platform's availability or the behaviour of its users. To the extent permitted by New Zealand law, we are not liable for any loss or damage arising from your use of the site, including failed transactions, misrepresented items, or disputes between users.",
  },
];

export default function TermsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />
      <Navbar />
      <ThemeToggle />

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

        <div className="mt-8">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Legal</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">Terms of Service</h1>
        </div>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
            >
              <h2 className="text-base font-black text-[var(--foreground)]">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{section.content}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-[var(--muted)]">
          Last updated: May 2026
        </p>
      </section>


    </main>
  );
}
