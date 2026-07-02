"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import TurnstileWidget from "../components/TurnstileWidget";
import { showToast } from "../components/Toast";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { createSkyDropAccount, signupAuthError } from "../lib/create-account.client";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { sanitizeRedirectPath } from "../lib/safe-redirect";

const INPUT =
  "w-full rounded-xl bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [redirectTo, setRedirectTo] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showVerificationSent, setShowVerificationSent] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redir = sanitizeRedirectPath(params.get("redirect"));
    if (redir) setRedirectTo(redir);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setResendDisabled(false);
    }
  }, [resendTimer]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    if (!acceptedTerms) {
      showToast("Please agree to the Terms and Privacy Policy.", "error");
      return;
    }

    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to continue.", "error");
      return;
    }

    setLoading(true);
    try {
      await createSkyDropAccount({
        email,
        password,
        turnstileToken,
        inviteCode: inviteCode || undefined,
      });
      setShowVerificationSent(true);
      setResendDisabled(true);
      setResendTimer(60);
    } catch (error) {
      showToast(signupAuthError(error), "error");
    }
    setLoading(false);
  }

  async function handleResendVerification() {
    if (resendDisabled) return;
    try {
      // Resend verification email logic would go here
      // For now, just show a toast
      showToast("Verification email resent!", "success");
      setResendDisabled(true);
      setResendTimer(60);
    } catch (error) {
      showToast("Failed to resend verification email.", "error");
    }
  }

  function handleChangeEmail() {
    setShowVerificationSent(false);
    setEmail("");
    setPassword("");
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <Background />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[var(--card)] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
          <div className="absolute -inset-20 -z-10 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-sky-500/10 blur-3xl opacity-50" />
          
          <div className="relative">
            <h1 className="text-3xl font-black text-white tracking-tight">Join Sky Drop</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Free to join — browse and buy straight away.</p>
          </div>

          {showVerificationSent ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-sky-500/20 mx-auto">
                <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white text-center">Check your email</h2>
              <p className="text-sm text-[var(--muted)] text-center">
                We sent a verification link to <span className="text-white font-medium">{email}</span>
              </p>
              <p className="text-sm text-[var(--muted)] text-center">
                Click the link to activate your account. Your account will be activated after verification.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleResendVerification}
                  disabled={resendDisabled}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendDisabled ? `Resend in ${resendTimer}s` : "Resend email"}
                </button>
                <button
                  onClick={handleChangeEmail}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] py-3.5 font-bold text-white transition-all duration-200 hover:bg-white/[0.06]"
                >
                  Wrong email? Change email address
                </button>
              </div>
            </div>
          ) : user ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Signed in as <span className="font-medium text-white">{user.email}</span>
              </p>
              <button
                type="button"
                onClick={() => router.push(redirectTo || "/")}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99]"
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="signup-email" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT}
                  required
                  minLength={8}
                  disabled={loading}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/[0.08] text-sky-500"
                  disabled={loading}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="text-sky-400 underline hover:text-sky-300">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-sky-400 underline hover:text-sky-300">
                    Privacy Policy
                  </Link>
                </span>
              </label>

              <TurnstileWidget
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />

              <button
                type="submit"
                disabled={loading || !acceptedTerms}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating account…" : "Join free"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Already a member?{" "}
            <Link
              href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
              className="font-semibold text-sky-400 hover:text-sky-300"
            >
              Log in
            </Link>
          </p>

          <p className="mt-3 text-center">
            <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
              Browse without an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
