"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import TurnstileWidget from "../components/TurnstileWidget";
import { showToast } from "../components/Toast";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { verifyTurnstileToken } from "../lib/create-account.client";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { sanitizeRedirectPath } from "../lib/safe-redirect";

const INPUT =
  "w-full rounded-xl bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10";

function loginAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code)
      : "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return error instanceof Error ? error.message : "Unable to sign in. Please check your email and password, then try again.";
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
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
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
    }
    setLoading(false);
  }

  const signupHref = redirectTo
    ? `/signup?redirect=${encodeURIComponent(redirectTo)}`
    : "/signup";

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <Background />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[var(--card)] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
          <div className="absolute -inset-20 -z-10 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-sky-500/10 blur-3xl opacity-50" />
          
          <div className="relative">
            <h1 className="text-3xl font-black text-white tracking-tight">Log in</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Welcome back to Sky Drop.</p>
          </div>

          {user ? (
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
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
                  Email
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
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT}
                  required
                  disabled={loading}
                />
              </div>

              <TurnstileWidget
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Logging in…" : "Log in"}
              </button>

              <div className="flex justify-between text-xs">
                <Link href="/forgot-password" className="text-sky-400 font-medium hover:text-sky-300">
                  Forgot password?
                </Link>
                <Link href="/" className="text-[var(--muted)] font-medium hover:text-[var(--foreground)]">
                  Browse listings
                </Link>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Not a member?{" "}
            <Link href={signupHref} className="text-sky-400 font-semibold hover:text-sky-300">
              Join free
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
