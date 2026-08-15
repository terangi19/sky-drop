"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import TurnstileWidget from "../components/TurnstileWidget";
import { showToast } from "../components/Toast";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { verifyTurnstileToken } from "../lib/create-account.client";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { sanitizeRedirectPath } from "../lib/safe-redirect";

const INPUT =
  "h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3.5 text-base text-white placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60";
const GENERIC_AUTH_ERROR =
  "We couldn’t sign you in with those details. Check your email and password and try again.";

function loginAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code)
      : "";
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return GENERIC_AUTH_ERROR;
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return GENERIC_AUTH_ERROR;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "1" || params.get("mode") === "signup") {
      const qs = params.toString();
      router.replace(`/signup${qs ? `?${qs}` : ""}`);
      return;
    }
    const redir = sanitizeRedirectPath(params.get("redirect"));
    if (redir) setRedirectTo(redir);
  }, [router]);

  useEffect(() => {
    // Firebase normally resolves persisted auth immediately. Do not leave the
    // sign-in form inaccessible if a browser storage provider is unavailable.
    const fallback = window.setTimeout(() => setAuthLoading(false), 2500);
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    router.replace(redirectTo || "/");
  }, [user, redirectTo, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to continue.", "error");
      return;
    }

    if (getTurnstileSiteKey()) {
      const ok = await verifyTurnstileToken(turnstileToken);
      if (!ok) {
        showToast("Security check failed. Please try again.", "error");
        return;
      }
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      showToast("Welcome back!", "success");
      router.push(redirectTo || "/");
    } catch (error) {
      showToast(loginAuthError(error), "error");
    } finally {
      setLoading(false);
    }
  }

  const signupHref = redirectTo
    ? `/signup?redirect=${encodeURIComponent(redirectTo)}`
    : "/signup";

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#090d14] text-white">
      <Navbar />

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[28.75rem] flex-col justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
        <div className="border border-slate-700 bg-[#111722] p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div>
            <p className="text-xs font-bold tracking-[0.22em] text-cyan-300">SKY DROP</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Sign in to manage your listings, messages, and purchases.
            </p>
          </div>

          {authLoading ? (
            <div className="mt-8 flex items-center justify-center py-10" role="status" aria-label="Checking sign-in status">
              <svg className="h-7 w-7 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="80" strokeDashoffset="60" />
              </svg>
            </div>
          ) : user ? (
            <div className="mt-8 space-y-5">
              <p className="text-sm text-slate-300">
                You&apos;re already signed in as <span className="font-medium text-white">{user.email}</span>.
              </p>
              <button
                type="button"
                onClick={() => router.push(redirectTo || "/")}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111722]"
              >
                Continue
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-100">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={INPUT}
                  required
                  disabled={loading}
                  aria-describedby="login-email-help"
                />
                <p id="login-email-help" className="mt-2 text-xs text-slate-400">Use the email connected to your Sky Drop account.</p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="login-password" className="text-sm font-medium text-slate-100">
                  Password
                  </label>
                  <Link href="/forgot-password" className="text-sm font-medium text-cyan-300 underline-offset-4 hover:text-cyan-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${INPUT} pr-14`}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-lg text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300 disabled:cursor-not-allowed"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.7a3 3 0 004.2 4.2M9.9 4.2A10.9 10.9 0 0112 4c5.5 0 9.5 4.3 10 8-.2 1.4-1 3-2.3 4.3M6.2 6.2C4.4 7.7 2.5 9.9 2 12c.6 3.7 4.5 8 10 8 1.3 0 2.5-.2 3.6-.7" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <TurnstileWidget
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111722] disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>

            </form>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-slate-500" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-700" />
            <span>NEW TO SKY DROP?</span>
            <span className="h-px flex-1 bg-slate-700" />
          </div>

          <p className="text-center text-sm text-slate-300">
            <Link href={signupHref} className="font-semibold text-cyan-300 underline underline-offset-4 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              Create an account
            </Link>
          </p>
          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-slate-300">Terms</Link>
            {" "}and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-slate-300">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
