"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { checkImage } from "../lib/nsfw";
import { showToast } from "./Toast";

type Props = {
  user: User | null;
  onKycStatusChange?: (status: string) => void;
};

const KYC_DESCRIPTION =
  "To list items for sale on Sky Drop, please submit a clear photo of yourself holding a valid driver licence or passport beside your face. You can still browse and buy items without completing seller verification.";

function KycCallout({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-sky-500/35 bg-sky-500/[0.08] p-4 shadow-[0_0_24px_rgba(14,165,233,0.08)]">
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
        <p className="text-sm font-semibold text-white">Seller verification</p>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{KYC_DESCRIPTION}</p>
      </KycCallout>
    );
  }

  if (status === "approved") {
    return (
      <KycCallout>
        <p className="text-sm font-semibold text-sky-300">Seller verification complete</p>
        <p className="mt-1 text-sm text-zinc-200">You can list items for sale on Sky Drop.</p>
      </KycCallout>
    );
  }

  if (status === "pending") {
    return (
      <KycCallout>
        <p className="text-sm font-semibold text-white">Seller verification</p>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">
          Your verification has been submitted and is under review. We&apos;ll notify you once it&apos;s complete.
        </p>
      </KycCallout>
    );
  }

  async function submit() {
    if (!user?.uid || !photoFile) return;
    if (!(await checkImage(photoFile)).safe) {
      showToast("Image could not be accepted.", "error");
      return;
    }
    setUploading(true);
    try {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const { storage } = await import("../lib/firebase");
      const ts = Date.now();
      const ext = photoFile.name.split(".").pop();
      const photoRef = ref(storage, `kyc/${user.uid}/${ts}_photo.${ext}`);
      await uploadBytes(photoRef, photoFile);
      const photoUrl = await getDownloadURL(photoRef);
      await setDoc(
        doc(db, "profiles", user.uid),
        {
          kycStatus: "pending",
          kycIdUrl: photoUrl,
          kycSelfieUrl: photoUrl,
          kycSubmittedAt: Timestamp.now(),
        },
        { merge: true }
      );
      setStatus("pending");
      onKycStatusChange?.("pending");
      setPhotoFile(null);
      showToast("Verification submitted for review.", "success");
    } catch {
      showToast("Upload failed.", "error");
    }
    setUploading(false);
  }

  return (
    <KycCallout>
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-white">Seller verification</p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{KYC_DESCRIPTION}</p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/25 p-3">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Photo holding your ID
          </label>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-zinc-200 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-400"
          />
          {previewUrl && (
            <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/40">
              <img
                src={previewUrl}
                alt="Preview of your ID photo"
                className="mx-auto max-h-56 w-full object-contain"
              />
              <p className="border-t border-white/10 px-3 py-2 text-center text-xs text-zinc-300">
                Preview — check your face and ID are clear before submitting
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!photoFile || uploading}
          className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-white hover:bg-sky-400 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Submit verification"}
        </button>

        <Link href="/profile" className="block text-center text-sm text-zinc-300 hover:text-sky-300">
          Verify later in Profile
        </Link>
      </div>
    </KycCallout>
  );
}
