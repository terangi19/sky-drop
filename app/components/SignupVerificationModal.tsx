"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendEmailVerification, User } from "firebase/auth";
import { auth } from "../lib/firebase";

interface Props {
  onClose: () => void;
  onVerify: () => void;
}

export default function SignupVerificationModal({ onClose, onVerify }: Props) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  function handleBrowse() {
    onClose();
    router.push("/");
  }

  async function handleResendEmail() {
    const user = auth.currentUser;
    if (!user) return;

    setResending(true);
    try {
      await sendEmailVerification(user);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to resend verification email:", error);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[var(--background)] p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Account Created!</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            We sent a verification link to your inbox. Check spam if you don&apos;t see it within a few minutes.
          </p>
        </div>

        <div className="mb-8 text-left space-y-4">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <h3 className="mb-2 font-semibold text-green-400">✓ Ready to Browse & Buy</h3>
            <p className="text-sm text-[var(--muted)]">
              You can immediately browse all listings and make purchases. No verification required.
            </p>
          </div>

          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
            <h3 className="mb-2 font-semibold text-sky-400">To Sell Items</h3>
            <p className="text-sm text-[var(--muted)]">
              Complete seller verification when you're ready to list items for sale.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => { onClose(); router.push("/post/ai"); }}
            className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
          >
            Create your first listing
          </button>
          <button
            onClick={handleBrowse}
            className="w-full rounded-lg border border-white/10 py-3 font-semibold text-[var(--foreground)] transition hover:bg-white/[0.05]"
          >
            Browse the marketplace
          </button>
          <button
            onClick={handleResendEmail}
            disabled={resending}
            className="w-full rounded-lg border border-sky-500/20 bg-sky-500/5 py-2.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/10 hover:text-sky-300 disabled:opacity-50"
          >
            {resending ? "Sending..." : resendSuccess ? "✓ Email sent!" : "Resend verification email"}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
