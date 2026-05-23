import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800/50 py-8 mt-auto">
      <div className="flex flex-col items-center justify-center gap-4 text-xs text-[var(--muted)]">
        <p>© 2025 Sky Drop. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/about" className="transition hover:text-[var(--foreground)]">About</Link>
          <Link href="/faqs" className="transition hover:text-[var(--foreground)]">FAQs</Link>
          <Link href="/terms" className="transition hover:text-[var(--foreground)]">Terms</Link>
          <Link href="/privacy" className="transition hover:text-[var(--foreground)]">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
