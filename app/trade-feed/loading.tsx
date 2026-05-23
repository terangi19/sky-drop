import Background from "../components/Background";
import Navbar from "../components/Navbar";

export default function TradeFeedLoading() {
  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-[1600px] px-4 pb-8 pt-4">
        <div className="mb-4">
          <div className="h-8 w-16 rounded-lg bg-zinc-800 animate-pulse" />
        </div>
        <div className="flex gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 w-28 rounded-xl bg-zinc-800 animate-pulse" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-pulse">
                <div className="h-24 w-24 shrink-0 rounded-xl bg-zinc-800" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex gap-2"><div className="h-4 w-16 rounded bg-zinc-800" /><div className="h-4 w-12 rounded bg-zinc-800" /></div>
                  <div className="h-5 w-3/4 rounded bg-zinc-800" />
                  <div className="h-4 w-1/2 rounded bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-48 rounded-xl bg-zinc-800/40 animate-pulse" />
            <div className="h-40 rounded-xl bg-zinc-800/40 animate-pulse" />
          </div>
        </div>
      </section>
    </main>
  );
}
