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
  const [showKycForm, setShowKycForm] = useState(false);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [idType, setIdType] = useState<"driver_licence" | "passport">("driver_licence");

  function handleGoHome() {
    onClose();
    router.push("/");
  }

  function handleVerify() {
    setShowKycForm(true);
  }

  async function submitKyc() {
    if (!user?.uid || !frontFile) {
      showToast("Please upload the front of your ID", "error");
      return;
    }
    if (idType === "driver_licence" && !backFile) {
      showToast("Please upload the back of your driver licence", "error");
      return;
    }
    const nsfwFront = await checkImage(frontFile);
    if (!nsfwFront.safe) {
      showToast(nsfwFront.reason ? `Front photo not accepted: ${nsfwFront.reason}` : "Front photo could not be accepted.", "error");
      return;
    }
    if (idType === "driver_licence" && backFile) {
      const nsfwBack = await checkImage(backFile);
      if (!nsfwBack.safe) {
        showToast(nsfwBack.reason ? `Back photo not accepted: ${nsfwBack.reason}` : "Back photo could not be accepted.", "error");
        return;
      }
    }
    setUploading(true);
    try {
      await submitKycPhoto(user, frontFile);
      showToast("Verification submitted for review.", "success");
      await notifyKycSubmitted(user);
      setFrontFile(null);
      setBackFile(null);
      setFrontPreview(null);
      setBackPreview(null);
      setShowKycForm(false);
      onClose();
      router.push("/");
    } catch (e) {
      showToast(e instanceof Error ? e.message : kycSubmitErrorMessage(e), "error");
    }
    setUploading(false);
  }

  function handleFrontFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setFrontFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setFrontPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setFrontPreview(null);
  }

  function handleBackFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setBackFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setBackPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setBackPreview(null);
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-[var(--background)] p-8 text-center">
        {!showKycForm ? (
          <>
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
              {!kycVerified && (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                  <p className="text-sm text-[var(--muted)] mb-2">
                    You can browse and purchase items without verification.
                  </p>
                  <p className="text-sm text-sky-400">
                    Complete seller verification to list items for sale.
                  </p>
                </div>
              )}
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
            </div>

            <div className="space-y-3">
              {!kycVerified && (
                <button
                  onClick={handleVerify}
                  className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400"
                >
                  Verify Now
                </button>
              )}
              <button
                onClick={handleGoHome}
                className="w-full rounded-lg border border-white/10 bg-transparent py-3 font-bold transition hover:bg-white/[0.05]"
              >
                Browse Listings
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setShowKycForm(false)}
              className="absolute top-4 left-4 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold">Seller Verification</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Upload your ID for verification
              </p>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                ID Type
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIdType("driver_licence")}
                  className={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    idType === "driver_licence"
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : "border-white/10 bg-white/[0.02] text-[var(--muted)] hover:border-white/20"
                  }`}
                >
                  Driver Licence
                </button>
                <button
                  type="button"
                  onClick={() => setIdType("passport")}
                  className={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                    idType === "passport"
                      ? "border-sky-500 bg-sky-500/10 text-sky-400"
                      : "border-white/10 bg-white/[0.02] text-[var(--muted)] hover:border-white/20"
                  }`}
                >
                  Passport
                </button>
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <div>
                <label className="mb-2 block text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Front of ID
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFrontFileChange}
                  className="block w-full rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-[var(--foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-400"
                />
                {frontPreview && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                    <img
                      src={frontPreview}
                      alt="Front of ID"
                      className="mx-auto max-h-56 w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {idType === "driver_licence" && (
                <div>
                  <label className="mb-2 block text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Back of ID
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackFileChange}
                    className="block w-full rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-[var(--foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-400"
                  />
                  {backPreview && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                      <img
                        src={backPreview}
                        alt="Back of ID"
                        className="mx-auto max-h-56 w-full object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={submitKyc}
                disabled={!frontFile || (idType === "driver_licence" && !backFile) || uploading}
                className="w-full rounded-lg bg-sky-500 py-3 font-bold text-[var(--foreground)] transition hover:bg-sky-400 disabled:opacity-50"
              >
                {uploading ? "Submitting…" : "Submit Verification"}
              </button>
              <button
                onClick={() => setShowKycForm(false)}
                className="w-full rounded-lg border border-white/10 bg-transparent py-3 font-bold transition hover:bg-white/[0.05]"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
