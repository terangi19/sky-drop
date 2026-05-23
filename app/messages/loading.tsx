import Background from "../components/Background";
import Navbar from "../components/Navbar";

export default function MessagesLoading() {
  return (
    <main className="relative min-h-screen bg-[var(--background)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-8">
        <div className="flex h-[70vh] rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="w-80 border-r border-zinc-800 p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-zinc-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-24 rounded bg-zinc-800" />
                  <div className="h-3 w-40 rounded bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
          </div>
        </div>
      </section>
    </main>
  );
}
