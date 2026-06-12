"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { checkImage } from "../lib/nsfw";
import { kycSubmitErrorMessage, notifyKycSubmitted, submitKycPhoto } from "../lib/kyc-submit.client";
import { showToast } from "./Toast";

type Props = {
  user: User | null;
  onKycStatusChange?: (status: string) => void;
};

const KYC_DESCRIPTION =
  "To list items for sale on Sky Drop, please submit a clear photo of yourself holding a valid driver licence or passport beside your face. You can still browse and buy items without completing seller verification.";

function KycCallout({ children }: { children: ReactNode }) {
  return (
    <div className="login-kyc-callout mt-6 rounded-xl border p-4">
      {children}
    </div>
  );
}

export default function LoginKycSection({ user, onKycStatusChange }: Props) {
  const [status, setStatus] = useState("unsubmitted");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setStatus("unsubmitted");
      return;
    }
    getDoc(doc(db, "profiles", user.uid)).then((snap) => {
      const d = snap.data();
      const next = String(d?.kycStatus || d?.proofOfAddress?.status || "unsubmitted");
      setStatus(next);
      onKycStatusChange?.(next);
    });
  }, [user?.uid, onKycStatusChange]);

  useEffect(() => {
    if (!user) onKycStatusChange?.("unsubmitted");
  }, [user, onKycStatusChange]);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  if (!user) {
    return (
      <KycCallout>
        <p className="login-kyc-title text-sm font-semibold">Seller verification</p>
        <p className="login-kyc-body mt-1.5 text-sm leading-relaxed">{KYC_DESCRIPTION}</p>
      </KycCallout>
    );
  }

  if (status === "approved") {
    return (
      <KycCallout>
        <p className="text-sm font-semibold text-sky-500">Seller verification complete</p>
        <p className="login-kyc-body mt-1 text-sm">You can list items for sale on Sky Drop.</p>
      </KycCallout>
    );
  }

  if (status === "pending") {
    return (
      <KycCallout>
        <p className="login-kyc-title text-sm font-semibold">Seller verification</p>
        <p className="login-kyc-body mt-1.5 text-sm leading-relaxed">
          Your verification has been submitted and is under review. We&apos;ll notify you once it&apos;s complete.
        </p>
      </KycCallout>
    );
  }

  async function submit() {
    if (!user?.uid || !photoFile) return;
    const nsfw = await checkImage(photoFile);
    if (!nsfw.safe) {
      showToast(nsfw.reason ? `Photo not accepted: ${nsfw.reason}` : "Image could not be accepted.", "error");
      return;
    }
    setUploading(true);
    try {
      await submitKycPhoto(user, photoFile);
      setStatus("pending");
      onKycStatusChange?.("pending");
      setPhotoFile(null);
      showToast("Verification submitted for review.", "success");
      await notifyKycSubmitted(user);
    } catch (e) {
      showToast(e instanceof Error ? e.message : kycSubmitErrorMessage(e), "error");
    }
    setUploading(false);
  }

  return (
    <KycCallout>
      <div className="space-y-4">
        <div>
          <p className="login-kyc-title text-base font-semibold">Seller verification</p>
          <p className="login-kyc-body mt-1.5 text-sm leading-relaxed">{KYC_DESCRIPTION}</p>
        </div>

        <div className="login-kyc-upload rounded-lg border p-3">
          <label className="login-kyc-label mb-2 block text-xs font-semibold uppercase tracking-wide">
            Photo holding your ID
          </label>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            className="login-kyc-body block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-400"
          />
          {previewUrl && (
            <div className="login-kyc-upload mt-3 overflow-hidden rounded-lg border">
              <img
                src={previewUrl}
                alt="Preview of your ID photo"
                className="mx-auto max-h-56 w-full object-contain"
              />
              <p className="login-kyc-label border-t border-white/10 px-3 py-2 text-center text-xs">
                Preview — check your face and ID are clear before submitting
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!photoFile || uploading}
          className="login-page-btn-primary w-full rounded-xl py-2.5 text-sm font-bold transition active:scale-[0.99] disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Submit verification"}
        </button>

        <Link href="/profile" className="login-page-link block text-center text-sm font-medium hover:underline">
          Verify later in Profile
        </Link>
      </div>
    </KycCallout>
  );
}
