import Background from "../components/Background";
import Navbar from "../components/Navbar";

export default function DashboardLoading() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div className="h-8 w-48 rounded bg-zinc-800 animate-pulse mb-8" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-pulse">
              <div className="h-4 w-20 rounded bg-zinc-800 mb-3" />
              <div className="h-8 w-16 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-pulse mt-6">
          <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 w-full rounded bg-zinc-800/60" />)}
          </div>
        </div>
      </section>
    </main>
  );
}
