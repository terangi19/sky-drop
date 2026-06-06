import Link from "next/link";
import Background from "./components/Background";
import Navbar from "./components/Navbar";

export default function NotFound() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-6xl mb-4">404</div>
        <h1 className="text-2xl font-black mb-2">Page not found</h1>
        <p className="text-sm text-[var(--muted)] mb-8">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex flex-col gap-3">
          <Link href="/" className="rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] text-center transition hover:bg-sky-400">Go home</Link>
          <Link href="/trade-feed" className="rounded-xl border border-zinc-700 py-3 text-sm font-bold text-[var(--muted)] text-center transition hover:text-[var(--foreground)] hover:border-zinc-600">Browse trades</Link>
        </div>
      </section>
    </main>
  );
}
