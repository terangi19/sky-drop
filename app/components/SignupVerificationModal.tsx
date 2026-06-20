"use client";

import { useRouter } from "next/navigation";

interface Props {
  onClose: () => void;
  onVerify: () => void;
}

export default function SignupVerificationModal({ onClose, onVerify }: Props) {
  const router = useRouter();

  function handleBrowse() {
    onClose();
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[var(--background)] p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Welcome to Sky Drop!</h2>
        </div>

        <div className="mb-8 text-left space-y-4">
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <h3 className="mb-2 font-semibold text-sky-400">Browse & Purchase</h3>
            <p className="text-sm text-[var(--muted)]">
              You can browse all listings and make purchases immediately.
            </p>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <h3 className="mb-2 font-semibold text-sky-400">Sell Items</h3>
            <p className="text-sm text-[var(--muted)]">
              List items for sale and connect with buyers across New Zealand.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleBrowse}
            className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
          >
            Browse Listings
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          I'll decide later
        </button>
      </div>
    </div>
  );
}
