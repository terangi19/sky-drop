"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import TurnstileWidget from "../components/TurnstileWidget";
import { showToast } from "../components/Toast";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { createSkyDropAccount, signupAuthError } from "../lib/create-account.client";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { sanitizeRedirectPath } from "../lib/safe-redirect";
import { funnel } from "../lib/funnel-events";
import { isVerifiedSignupUser } from "../lib/signup-verification";

const INPUT =
  "h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [redirectTo] = useState(() =>
    typeof window === "undefined"
      ? ""
      : sanitizeRedirectPath(new URLSearchParams(window.location.search).get("redirect"))
  );
  const [inviteCode, setInviteCode] = useState("");
  const [showVerificationSent, setShowVerificationSent] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationDeliveryFailed, setVerificationDeliveryFailed] = useState(false);
  const [signupCreatedThisVisit, setSignupCreatedThisVisit] = useState(false);
  const submitInFlight = useRef(false);
  const startedForUser = useRef<string | null>(null);
  const verifiedForUser = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const isVerified = isVerifiedSignupUser(u);
      setEmailVerified(isVerified);
      // An existing, unverified member who returns to signup needs the same
      // resend/change-email recovery path — never a misleading bypass button.
      if (u && !isVerified && !submitInFlight.current) setShowVerificationSent(true);
      setAuthLoading(false);
    });
    return () => unsubscribe();
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

    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setLoading(true);
    try {
      const result = await createSkyDropAccount({
        email,
        password,
        turnstileToken,
        inviteCode: inviteCode || undefined,
      });
      setVerificationDeliveryFailed(!result.verificationSent);
      setShowVerificationSent(true);
      setSignupCreatedThisVisit(true);
      setResendDisabled(true);
      setResendTimer(60);
    } catch (error) {
      showToast(signupAuthError(error), "error");
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      user &&
      signupCreatedThisVisit &&
      showVerificationSent &&
      startedForUser.current !== user.uid
    ) {
      startedForUser.current = user.uid;
      funnel.signupStarted(user.uid);
    }
  }, [user, signupCreatedThisVisit, showVerificationSent]);

  useEffect(() => {
    if (!user || !showVerificationSent) return;
    const signupUser = user;
    let cancelled = false;

    async function trackVerifiedSignup() {
      await signupUser.reload();
      const refreshedUser = auth.currentUser;
      setEmailVerified(isVerifiedSignupUser(refreshedUser));
      if (
        !cancelled &&
        isVerifiedSignupUser(refreshedUser) &&
        verifiedForUser.current !== signupUser.uid
      ) {
        verifiedForUser.current = signupUser.uid;
        funnel.signupVerified(signupUser.uid);
      }
    }

    void trackVerifiedSignup();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void trackVerifiedSignup();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, showVerificationSent]);

  const verified = emailVerified;

  async function handleResendVerification() {
    if (resendDisabled) return;
    if (!user) {
      showToast("Please sign in again", "error");
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/send-verification-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: user.email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          showToast("Too many attempts. Please wait a few minutes.", "error");
        } else {
          showToast(data.error || "Failed to resend verification email.", "error");
        }
        return;
      }
      showToast("Verification email resent!", "success");
      setVerificationDeliveryFailed(false);
      setResendDisabled(true);
      setResendTimer(60);
    } catch (error) {
      showToast("Failed to resend verification email.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangeEmail() {
    await signOut(auth).catch(() => {});
    const { publishAuthBroadcast } = await import("../lib/auth-broadcast");
    publishAuthBroadcast({ type: "signed-out" });
    setShowVerificationSent(false);
    setVerificationDeliveryFailed(false);
    setEmail("");
    setPassword("");
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#090d14] text-white">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[28.75rem] flex-col justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <div className="border border-slate-700 bg-[#111722] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div>
            <p className="text-xs font-bold tracking-[0.22em] text-cyan-300">SKY DROP</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Join Sky Drop</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">Free to join — browse straight away. Verify your email to message, buy, or sell.</p>
          </div>

          {authLoading ? (
            <div className="mt-6 flex items-center justify-center py-12">
              <svg className="h-8 w-8 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="80" strokeDashoffset="60" />
              </svg>
            </div>
          ) : showVerificationSent ? (
            <div className="mt-6 space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400/15">
                <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-center text-xl font-semibold text-white">{verified ? "Email verified" : "Check your email"}</h2>
              <p className="text-center text-sm text-slate-300">
                {verified
                  ? "Your account is ready."
                  : verificationDeliveryFailed
                    ? "Your account was created, but we couldn't send the verification email."
                    : <>We sent a verification link to <span className="font-medium text-white">{user?.email || email}</span></>}
              </p>
              {!verified && (
                <p className="text-center text-sm text-slate-300">
                  {verificationDeliveryFailed
                    ? "Use Resend email below to try again."
                    : "Click the link to activate your account."}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {verified ? (
                  <button type="button" onClick={() => router.replace(redirectTo || "/")} className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                    Continue
                  </button>
                ) : <>
                  <button onClick={handleResendVerification} disabled={resendDisabled || loading} className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
                    {resendDisabled ? `Resend in ${resendTimer}s` : "Resend email"}
                  </button>
                  <button onClick={handleChangeEmail} className="flex h-12 w-full items-center justify-center rounded-lg border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:border-slate-500">
                    Wrong email? Change email address
                  </button>
                </>}
              </div>
            </div>
          ) : user ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-slate-300">
                Signed in as <span className="font-medium text-white">{user.email}</span>
              </p>
              <button
                type="button"
                onClick={() => router.push(redirectTo || "/")}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-slate-100">
                  Email address
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
                <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-slate-100">
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

              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-300">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-600 text-cyan-400"
                  disabled={loading}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="text-cyan-300 underline hover:text-cyan-200">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-cyan-300 underline hover:text-cyan-200">
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
                className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {loading ? "Creating account…" : "Join free"}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-300">
            Already a member?{" "}
            <Link
              href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
              className="font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
            >
              Log in
            </Link>
          </p>

          <p className="mt-3 text-center">
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-200">
              Browse without an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
