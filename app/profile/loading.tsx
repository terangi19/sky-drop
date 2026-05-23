import Background from "../components/Background";
import Navbar from "../components/Navbar";

export default function ProfileLoading() {
  return (
    <main className="relative min-h-screen bg-[var(--background)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden animate-pulse">
          <div className="h-48 bg-zinc-800" />
          <div className="px-6 pb-6 -mt-12">
            <div className="h-24 w-24 rounded-full bg-zinc-700 border-4 border-zinc-950" />
            <div className="mt-4 space-y-3">
              <div className="h-6 w-48 rounded bg-zinc-800" />
              <div className="h-4 w-32 rounded bg-zinc-800" />
              <div className="h-4 w-64 rounded bg-zinc-800/60" />
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 animate-pulse">
              <div className="h-32 rounded-lg bg-zinc-800 mb-3" />
              <div className="h-4 w-3/4 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
