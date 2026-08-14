import Link from "next/link";
import type { ReactNode } from "react";
import Background from "./Background";
import Navbar from "./Navbar";

const helpLinks = [
  { href: "/about", label: "About" },
  { href: "/faqs", label: "FAQs" },
  { href: "/buyer-protection", label: "Stay Safe" },
  { href: "/seller-guidelines", label: "Selling on Sky Drop" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

type HelpTrustLayoutProps = {
  activePath: string;
  eyebrow: "Help" | "Trust & safety" | "Legal";
  title: string;
  intro: string;
  children: ReactNode;
  toc?: { id: string; label: string }[];
};

export default function HelpTrustLayout({
  activePath,
  eyebrow,
  title,
  intro,
  children,
  toc,
}: HelpTrustLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-sm text-[var(--muted)] outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <span aria-hidden="true">←</span>
          Back to marketplace
        </Link>

        <div className="mt-7 border-y border-[var(--border)] py-4 sm:hidden">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Help &amp; information</p>
          <nav aria-label="Help and information">
            <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
              {helpLinks.map((link) => {
                const selected = link.href === activePath;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={selected ? "page" : undefined}
                    className={`shrink-0 rounded-md px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      selected
                        ? "bg-sky-500/10 font-semibold text-sky-400"
                        : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[12rem_minmax(0,44rem)] lg:gap-14">
          <aside className="hidden lg:block">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Help &amp; information</p>
            <nav aria-label="Help and information" className="border-l border-[var(--border)]">
              {helpLinks.map((link) => {
                const selected = link.href === activePath;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={selected ? "page" : undefined}
                    className={`block border-l -ml-px px-4 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      selected
                        ? "border-sky-400 font-semibold text-sky-400"
                        : "border-transparent text-[var(--muted)] hover:border-zinc-600 hover:text-[var(--foreground)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <article className="min-w-0">
            <header className="border-b border-[var(--border)] pb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">{eyebrow}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">{intro}</p>
            </header>

            {toc && toc.length > 0 && (
              <nav aria-label="On this page" className="border-b border-[var(--border)] py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">On this page</p>
                <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a className="text-sm text-sky-400 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" href={`#${item.id}`}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="py-8 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-[var(--foreground)] [&_h2:first-child]:mt-0 [&_h3]:mt-6 [&_h3]:scroll-mt-24 [&_h3]:font-semibold [&_h3]:text-[var(--foreground)] [&_p]:mt-3 [&_p]:text-[0.9375rem] [&_p]:leading-7 [&_p]:text-[var(--muted)] [&_li]:text-[0.9375rem] [&_li]:leading-7 [&_li]:text-[var(--muted)] [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1 [&_a]:text-sky-400 [&_a]:underline-offset-4 hover:[&_a]:underline [&_details]:border-b [&_details]:border-[var(--border)] [&_summary]:cursor-pointer [&_summary]:py-4 [&_summary]:pr-8 [&_summary]:text-[0.9375rem] [&_summary]:font-semibold [&_summary]:text-[var(--foreground)] focus-visible:[&_summary]:outline focus-visible:[&_summary]:outline-2 focus-visible:[&_summary]:outline-sky-400">
              {children}
            </div>

            <aside className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
              Need help? Visit the <Link className="text-sky-400 underline-offset-4 hover:underline" href="/faqs">FAQs</Link> or email{" "}
              <a className="text-sky-400 underline-offset-4 hover:underline" href="mailto:support@skydrop.co.nz">support@skydrop.co.nz</a>.
            </aside>
          </article>
        </div>
      </div>
    </main>
  );
}
