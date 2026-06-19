export default function UnavailablePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--background)] px-6 text-center">
      <div className="max-w-lg">
        <div className="mb-6 text-7xl">🌏</div>
        <h1 className="text-4xl font-black text-sky-400">Not available in your region</h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">
          Sky Drop is currently only available in New Zealand.
        </p>
      </div>
    </main>
  );
}
