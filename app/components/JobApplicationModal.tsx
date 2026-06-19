"use client";

import { useState, useRef } from "react";
import { submitApplication, hasApplied } from "../lib/jobApplications";

interface Props {
  listingId: string;
  listingTitle: string;
  employerEmail: string;
  employerId: string;
  userEmail: string;
  userName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function JobApplicationModal({ listingId, listingTitle, employerEmail, employerId, userEmail, userName, onClose, onSubmitted }: Props) {
  const [name, setName] = useState(userName);
  const [phone, setPhone] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"form" | "success" | "error">("form");
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!name.trim() || !coverLetter.trim()) {
      setErrorMsg("Name and cover letter are required.");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    try {
      const already = await hasApplied(listingId, userEmail);
      if (already) {
        setErrorMsg("You have already applied for this job.");
        setUploading(false);
        return;
      }

      await submitApplication({
        listingId,
        listingTitle,
        employerEmail,
        employerId,
        applicantEmail: userEmail,
        applicantName: name.trim(),
        applicantPhone: phone.trim(),
        coverLetter: coverLetter.trim(),
        resumeFile,
      });

      setStep("success");
      onSubmitted();
    } catch (e) {
      console.error("Application failed:", e);
      setErrorMsg("Failed to submit application. Try again.");
    }
    setUploading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {step === "success" ? (
          <div className="text-center py-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/20">
              <svg className="h-8 w-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-black text-[var(--foreground)]">Application Submitted!</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Your application for <span className="font-bold text-[var(--foreground)]">{listingTitle}</span> has been sent.</p>
            <button onClick={onClose} className="mt-6 w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-white hover:bg-sky-400 transition">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[var(--foreground)]">Apply for this Job</h3>
              <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">&times;</button>
            </div>

            <p className="text-sm text-[var(--muted)] mb-4">
              Applying for <span className="font-bold text-[var(--foreground)]">{listingTitle}</span>
            </p>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs text-red-400">{errorMsg}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--muted)]">Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--muted)]">Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--muted)]">Cover Letter *</label>
                <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={5}
                  placeholder="Tell the employer why you're a good fit for this role..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 resize-none" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-[var(--muted)]">Resume / CV (optional)</label>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border border-dashed border-zinc-700 bg-zinc-800/40 px-4 py-3 text-sm text-[var(--muted)] hover:border-zinc-600 hover:text-[var(--foreground)] transition">
                  {resumeFile ? resumeFile.name : "Tap to select resume (PDF, DOC, TXT)"}
                </button>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={uploading}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-500 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl disabled:opacity-50">
              {uploading ? "Submitting..." : "Submit Application"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
