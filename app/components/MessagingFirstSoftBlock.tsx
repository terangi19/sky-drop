import Link from "next/link";
import Navbar from "./Navbar";
import Background from "./Background";
import { V1_ARRANGE_SAFETY_ONE_LINER } from "../lib/conversation-safety";

type Props = {
  title: string;
  description?: string;
};

/** Messaging-first landing when marketplace card checkout UI is off. */
export default function MessagingFirstSoftBlock({
  title,
  description = "Message the seller and arrange the purchase directly. Agree on payment, pickup or delivery in Messages.",
}: Props) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <section className="relative z-10 mx-auto max-w-lg px-6 py-20 text-center sm:py-28">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">{description}</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{V1_ARRANGE_SAFETY_ONE_LINER}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/messages"
            className="inline-flex rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400"
          >
            Open Messages
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)] px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:border-sky-500/30"
          >
            Browse listings
          </Link>
        </div>
      </section>
    </main>
  );
}
