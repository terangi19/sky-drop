"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import { showToast } from "../components/Toast";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";
import { sanitizeRedirectPath } from "../lib/safe-redirect";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const redirectTo =
    typeof window === "undefined"
      ? ""
      : sanitizeRedirectPath(new URLSearchParams(window.location.search).get("redirect"));
  const loginHref = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login";

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
        handleCodeInApp: false,
      });
      setSent(true);
    } catch {
      // Don't reveal if email exists — always show success
      setSent(true);
    }
    setSending(false);
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#090d14] text-white">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[28.75rem] flex-col justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <Link href={loginHref} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-cyan-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Login
        </Link>

        <div className="border border-slate-700 bg-[#111722] p-5 shadow-2xl shadow-black/20 sm:p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/10">
                <svg className="h-7 w-7 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs font-bold tracking-[0.22em] text-cyan-300">SKY DROP</p>
              <h1 className="mt-3 text-xl font-semibold text-white">Check your email</h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                If an account exists for <strong className="text-white">{email}</strong>, we&apos;ve sent a password reset link. It will arrive within a few minutes.
              </p>
              <p className="mt-4 text-xs text-slate-400">
                Didn&apos;t receive it? Check your spam folder (mark as &quot;Not spam&quot; if found). If still not received after 5 minutes,{" "}
                <button onClick={() => { setSent(false); setEmail(""); }} className="text-sky-400 underline hover:text-sky-300 transition-colors">
                  try again
                </button>.
              </p>
              <Link href={loginHref} className="mt-6 inline-flex h-12 items-center gap-1.5 rounded-lg bg-cyan-400 px-5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300">
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold tracking-[0.22em] text-cyan-300">SKY DROP</p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Reset your password</h1>
              <p className="mt-2 text-sm text-slate-300">Enter your email address and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-100">Email address</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className="h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
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

        <p className="mt-6 text-center text-xs text-slate-400">
          Remember your password?{" "}
          <Link href={loginHref} className="text-cyan-300 hover:text-cyan-200 transition-colors">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
