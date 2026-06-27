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
import {
  defaultUsernameFromEmail,
  isUsernameAvailable,
  normalizeUsernameInput,
  validateUsername,
} from "../lib/username";

const INPUT =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "ok" | "taken" | "invalid">("idle");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [redirectTo, setRedirectTo] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redir = sanitizeRedirectPath(params.get("redirect"));
    if (redir) setRedirectTo(redir);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!usernameTouched && email.includes("@")) {
      setUsername(defaultUsernameFromEmail(email));
    }
  }, [email, usernameTouched]);

  useEffect(() => {
    const u = normalizeUsernameInput(username);
    if (!u) {
      setUsernameStatus("idle");
      return;
    }
    const validation = validateUsername(u);
    if (!validation.valid) {
      setUsernameStatus("invalid");
      return;
    }
    let cancelled = false;
    isUsernameAvailable(u).then((available) => {
      if (!cancelled) setUsernameStatus(available ? "ok" : "taken");
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || !username.trim()) return;

    const normalizedUsername = normalizeUsernameInput(username);
    const usernameValidation = validateUsername(normalizedUsername);
    if (!usernameValidation.valid) {
      showToast(usernameValidation.error || "Choose a valid username.", "error");
      return;
    }
    if (usernameStatus === "taken") {
      showToast("That username is already taken. Try another one.", "error");
      return;
    }

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
        username: normalizedUsername,
        inviteCode: inviteCode || undefined,
      });
      showToast("Welcome to Sky Drop! Check your email to verify your address.", "success");
      router.push(redirectTo || "/");
    } catch (error) {
      showToast(signupAuthError(error), "error");
    }
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <Background />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-950/90 to-zinc-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
          <div className="absolute -inset-20 -z-10 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-purple-500/10 blur-3xl opacity-50" />
          
          <div className="relative">
            <h1 className="text-3xl font-black text-white tracking-tight">Join Sky Drop</h1>
            <p className="mt-2 text-sm text-zinc-400">Free to join — browse and buy straight away.</p>
          </div>

          {user ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-zinc-400">
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
                <label htmlFor="signup-email" className="mb-1.5 block text-xs font-semibold text-zinc-400">
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
                <label htmlFor="signup-username" className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  Username
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    @
                  </span>
                  <input
                    id="signup-username"
                    type="text"
                    autoComplete="username"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      setUsername(e.target.value);
                    }}
                    className={`${INPUT} pl-8`}
                    required
                    maxLength={30}
                    disabled={loading}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Your public name on Sky Drop — like Trade Me member name.
                </p>
                {usernameStatus === "taken" && (
                  <p className="mt-1 text-[11px] text-amber-400">That username is taken — try another.</p>
                )}
                {usernameStatus === "invalid" && username.trim() && (
                  <p className="mt-1 text-[11px] text-amber-400">
                    Use 3–30 characters; start with a letter.
                  </p>
                )}
                {usernameStatus === "ok" && (
                  <p className="mt-1 text-[11px] text-emerald-400">Username available</p>
                )}
              </div>

              <div>
                <label htmlFor="signup-password" className="mb-1.5 block text-xs font-semibold text-zinc-400">
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

              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-zinc-400">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-600 text-sky-500"
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

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already a member?{" "}
            <Link
              href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
              className="font-semibold text-sky-400 hover:text-sky-300"
            >
              Log in
            </Link>
          </p>

          <p className="mt-3 text-center">
            <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">
              Browse without an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
