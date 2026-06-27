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
  "login-page-input w-full rounded-lg px-4 py-3 text-sm bg-white/[0.03] text-white placeholder:text-[var(--muted)] outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10";

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
      return error instanceof Error ? error.message : "Something went wrong";
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
        <div className="login-page-card rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-8 shadow-xl backdrop-blur-sm">
          <h1 className="login-page-title text-2xl font-bold">Log in</h1>
          <p className="login-page-body mt-1 text-sm text-zinc-400">Welcome back to Sky Drop.</p>

          {user ? (
            <p className="login-page-body mt-6 text-sm">
              Signed in as <span className="font-semibold">{user.email}</span>
            </p>
          ) : (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className="login-page-body mb-1.5 block text-xs font-medium">
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
                <label htmlFor="login-password" className="login-page-body mb-1.5 block text-xs font-medium">
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
                className="login-page-btn-primary w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50"
              >
                {loading ? "Logging in…" : "Log in"}
              </button>

              <div className="flex justify-between text-xs">
                <Link href="/forgot-password" className="login-page-link font-medium">
                  Forgot password?
                </Link>
                <Link href="/" className="login-page-link font-medium">
                  Browse listings
                </Link>
              </div>
            </form>
          )}

          <p className="login-page-body mt-6 text-center text-sm">
            Not a member?{" "}
            <Link href={signupHref} className="login-page-link font-semibold hover:underline">
              Join free
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
