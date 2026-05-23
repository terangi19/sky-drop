"use client";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body className="bg-[#09090b] text-white">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-xl font-black">Something went wrong</h1>
            <p className="mt-2 text-sm text-zinc-400">A critical error occurred. Please refresh the page.</p>
            <button onClick={reset} className="mt-6 rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold hover:bg-sky-400">Refresh</button>
          </div>
        </div>
      </body>
    </html>
  );
}
