"use client";

import { useRouter } from "next/navigation";

interface Props {
  onClose: () => void;
  kycVerified?: boolean;
}

export default function LoginSuccessModal({ onClose, kycVerified = false }: Props) {
  const router = useRouter();

  function handleGoHome() {
    onClose();
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[var(--background)] p-8 text-center">
        <div className="mb-6">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${kycVerified ? 'bg-green-500/10 text-green-400' : 'bg-sky-500/10 text-sky-400'}`}>
            {kycVerified ? (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <h2 className="text-2xl font-bold">Welcome back!</h2>
        </div>

        <div className="mb-8 text-center space-y-3">
          <p className="text-[var(--muted)]">
            You're now logged in to Sky Drop.
          </p>
          {kycVerified && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <p className="text-sm text-green-400 flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verified seller - you can list items for sale
              </p>
            </div>
          )}
          {!kycVerified && (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-sm text-[var(--muted)]">
                Complete seller verification to list items for sale.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleGoHome}
          className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
        >
          Go to Homepage
        </button>
      </div>
    </div>
  );
}
