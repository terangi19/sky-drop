import Background from "../components/Background";
import Navbar from "../components/Navbar";

export default function PurchasesLoading() {
  return (
    <main className="relative min-h-screen bg-[var(--background)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-8">
        <div className="h-8 w-40 rounded bg-zinc-800 animate-pulse mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse">
              <div className="h-20 w-20 rounded-lg bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-3/4 rounded bg-zinc-800" />
                <div className="h-4 w-1/3 rounded bg-zinc-800" />
                <div className="h-10 w-28 rounded-lg bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
