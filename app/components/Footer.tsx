"use client";

import Link from "next/link";

export default function Footer() {
  const showAnnouncement = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("show-sky-drop-announcement"));
  };

  return (
    <footer className="border-t border-zinc-800/50 py-8 mt-auto">
      <div className="flex flex-col items-center justify-center gap-4 text-xs text-[var(--muted)]">
        <p>© 2026 Sky Drop. Operated in New Zealand. All payments handled by Stripe.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/about" className="transition hover:text-[var(--foreground)]">About</Link>
          <Link href="/faqs" className="transition hover:text-[var(--foreground)]">FAQs</Link>
          <Link href="/buyer-protection" className="transition hover:text-[var(--foreground)]">Buyer Protection</Link>
          <Link href="/seller-guidelines" className="transition hover:text-[var(--foreground)]">Seller Guide</Link>
          <Link href="/terms" className="transition hover:text-[var(--foreground)]">Terms</Link>
          <Link href="/privacy" className="transition hover:text-[var(--foreground)]">Privacy</Link>
          <button
            onClick={showAnnouncement}
            className="transition hover:text-[var(--foreground)] underline underline-offset-2"
          >
            Show announcement
          </button>
        </div>
        <p className="text-[10px] text-zinc-700">Payments powered by <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors underline">Stripe</a> · Need help? <Link href="/faqs" className="text-zinc-500 hover:text-zinc-300 transition-colors underline">FAQs</Link> · <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support@skydrop.co.nz" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors underline">support@skydrop.co.nz</a></p>
      </div>
    </footer>
  );
}
