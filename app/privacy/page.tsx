"use client";

import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";

const sections = [
  {
    id: "collect",
    title: "Information We Collect",
    content:
      "We collect information you give us, like your name, email address, phone number, and profile details when you create an account or list an item. We also collect data automatically, including your IP address, browser type, device info, and how you use the site. If you chat with other users, those messages are stored so we can facilitate communication and resolve disputes.",
  },
  {
    id: "use",
    title: "How We Use It",
    content:
      "We use your information to run Sky Drop — showing listings, processing transactions, sending notifications, and helping buyers and sellers connect. We also use it to improve the platform, detect and prevent fraud, investigate reports of scam activity, enforce our terms, comply with New Zealand law, and send occasional service-related emails. We never sell your personal information.",
  },
  {
    id: "fraud",
    title: "Fraud & Law Enforcement",
    content:
      "Sky Drop has a zero-tolerance policy for scams, fraud, and illegal activity. Accounts involved in fraudulent behaviour may be permanently removed from the platform, have listings removed.",
  },
  {
    id: "sharing",
    title: "Data Sharing",
    content:
      "We share your information with other Sky Drop users only as needed for transactions — for example, your username and contact details are visible to someone you're buying from or selling to. Marketplace purchases are arranged between buyers and sellers in Messages; Sky Drop does not process those payments. We may share data with trusted service providers who help us run the platform (hosting, fraud detection, email delivery, and payment processors for optional paid upgrades or any historical card orders), and with law enforcement or government agencies when required by New Zealand law or when investigating fraud.",
  },
  {
    id: "cookies",
    title: "Cookies",
    content:
      "We use cookies and similar technologies to keep you logged in, remember your preferences, and understand how the site is used. You can control cookies through your browser settings, but disabling them may affect how Sky Drop works. We also use local storage on your device to save your theme preference and recently viewed items.",
  },
  {
    id: "rights",
    title: "Your Rights",
    content:
      "Under the Privacy Act 2020, you have the right to access and correct your personal information held by Sky Drop. You can update your profile details anytime in your account settings. If you want a copy of your data or to request deletion, contact us and we'll respond within 20 working days. Note that some information may be retained where required by law or for fraud prevention purposes.",
  },
  {
    id: "contact",
    title: "Contact",
    content:
      "If you have questions about this policy or your privacy, reach out to us at support@skydrop.co.nz. We're based in New Zealand and all data is stored and processed in accordance with New Zealand privacy law.",
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

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <Background />
      <Navbar />
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
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Privacy</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--foreground)]">Privacy Policy</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            How Sky Drop collects, uses, and protects your personal information.
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
