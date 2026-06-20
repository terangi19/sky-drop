"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { checkImage } from "../lib/nsfw";
import { kycSubmitErrorMessage, notifyKycSubmitted, submitKycPhoto } from "../lib/kyc-submit.client";
import { showToast } from "./Toast";

interface Props {
  onClose: () => void;
  kycVerified?: boolean;
  user?: User | null;
}

export default function LoginSuccessModal({ onClose, kycVerified = false, user }: Props) {
  const router = useRouter();

  function handleGoHome() {
    onClose();
    router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[var(--background)] p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Welcome back!</h2>
        </div>

        <div className="mb-8 text-center">
          <p className="text-[var(--muted)]">
            You're now logged in to Sky Drop.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoHome}
            className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
          >
            Browse Listings
          </button>
        </div>
      </div>
    </div>
  );
}
