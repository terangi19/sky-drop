"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface KYCGuardProps {
  status: "unsubmitted" | "pending" | "rejected";
  rejectionReason?: string;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function KYCGuard({ status, rejectionReason, userId, onClose, onSubmitted }: KYCGuardProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!file) return;
    setUploading(true);
    try {
      const { submitKYC } = await import("../lib/kyc");
      await submitKYC(userId, file);
      onSubmitted();
    } catch {
      alert("Failed to upload document. Try again.");
    }
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-[var(--foreground)]">Identity Verification</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
        </div>

        <p className="mt-2 text-sm text-[var(--muted)]">
          Sellers must verify their identity before listing items. Buyers don't need verification.
        </p>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-[var(--foreground)]">Status</span>
            {status === "pending" && <span className="text-sm font-bold text-amber-400">Pending review</span>}
            {status === "rejected" && <span className="text-sm font-bold text-red-400">Rejected</span>}
            {status === "unsubmitted" && <span className="text-sm font-bold text-[var(--muted)]">Not submitted</span>}
          </div>
        </div>

        {status === "pending" && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm text-[var(--foreground)]">Your verification is being reviewed. You'll be notified when it's approved.</p>
          </div>
        )}

        {status === "rejected" && rejectionReason && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm font-bold text-red-400">Reason: {rejectionReason}</p>
          </div>
        )}

        {(status === "unsubmitted" || status === "rejected") && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-[var(--muted)]">Upload a photo of your government-issued ID (passport, driver licence).</p>
            <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-zinc-700 bg-zinc-800/40 px-4 py-3 text-sm text-[var(--muted)] hover:border-zinc-600 hover:text-[var(--foreground)] transition">
              {file ? file.name : "Tap to select ID document"}
            </button>
            <button onClick={handleSubmit} disabled={!file || uploading}
              className="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-[var(--foreground)] hover:bg-sky-400 disabled:opacity-50 transition">
              {uploading ? "Uploading..." : "Submit for Verification"}
            </button>
          </div>
        )}

        <button onClick={onClose} className="mt-3 w-full rounded-xl border border-zinc-700 py-3 text-sm font-bold text-[var(--muted)] hover:text-[var(--foreground)] transition">
          Close
        </button>
      </div>
    </div>
  );
}
