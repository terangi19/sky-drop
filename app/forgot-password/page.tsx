"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { AwhinaUnderHeader } from "../components/AwhinaOnlineBadge";
import { showToast } from "../components/Toast";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      showToast("Enter your email address.", "error");
      return;
    }
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: (process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz") + "/login",
      });
      setSent(true);
    } catch {
      // Don't reveal if email exists — always show success
      setSent(true);
    }
    setSending(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-md px-6 py-16 sm:py-24">
        <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-sky-400 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Login
        </Link>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-black text-[var(--foreground)]">Check Your Email</h1>
              <AwhinaUnderHeader centered className="mt-3" />
              <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">
                If an account exists for <strong className="text-[var(--foreground)]">{email}</strong>, we&apos;ve sent a password reset link. It will arrive within a few minutes.
              </p>
              <p className="mt-4 text-xs text-zinc-600">
                Didn&apos;t receive it? Check your spam folder or{" "}
                <button onClick={() => { setSent(false); setEmail(""); }} className="text-sky-400 underline hover:text-sky-300 transition-colors">
                  try again
                </button>.
              </p>
              <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97]">
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-[var(--foreground)]">Reset Your Password</h1>
              <AwhinaUnderHeader className="mt-2" />
              <p className="mt-2 text-sm text-[var(--muted)]">Enter your email address and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-sky-500 placeholder:text-zinc-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:shadow-xl active:scale-[0.97] disabled:opacity-50"
                >
                  {sending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="80" strokeDashoffset="60" /></svg>
                      Sending...
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Remember your password?{" "}
          <Link href="/login" className="text-sky-400 hover:text-sky-300 transition-colors">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
