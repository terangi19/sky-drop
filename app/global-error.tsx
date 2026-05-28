"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("Unhandled error:", error);
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex items-center justify-center bg-[#111318] text-white">
        <div className="max-w-md text-center px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 mx-auto">
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-black text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-400">Sky Drop encountered an unexpected error. Please try again.</p>
          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={reset} className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-white hover:bg-sky-400 transition">Try again</button>
            <a href="/" className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition">Go home</a>
          </div>
        </div>
      </body>
    </html>
  );
}
