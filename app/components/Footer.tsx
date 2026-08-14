import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto] sm:px-6">
        <div>
          <Link href="/" className="text-sm font-semibold text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            Sky Drop
          </Link>
          <p className="mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">
            A New Zealand marketplace. Browse listings, message sellers, and arrange payment, pickup or delivery directly.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">© 2026 Sky Drop. Operated in New Zealand.</p>
        </div>
        <nav aria-label="Help and legal" className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">Help &amp; information</p>
          <div className="mt-3 flex max-w-md flex-wrap gap-x-5 gap-y-3 text-xs text-[var(--muted)] sm:justify-end">
            <Link href="/about" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">About</Link>
            <Link href="/faqs" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">FAQs</Link>
            <Link href="/buyer-protection" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">Stay Safe</Link>
            <Link href="/seller-guidelines" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">Selling on Sky Drop</Link>
            <Link href="/terms" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">Terms</Link>
            <Link href="/privacy" className="outline-none transition hover:text-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">Privacy</Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Need help?{" "}
            <a href="mailto:support@skydrop.co.nz" className="text-sky-400 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
              support@skydrop.co.nz
            </a>
          </p>
        </nav>
      </div>
    </footer>
  );
}
