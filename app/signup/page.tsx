"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import SignupVerificationModal from "../components/SignupVerificationModal";
import { showToast } from "../components/Toast";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  type User,
} from "firebase/auth";

import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { buildEmailHtml } from "../lib/email";
import { formatNZPhone } from "../lib/phone-auth";
import TurnstileWidget from "../components/TurnstileWidget";
import { getTurnstileSiteKey } from "../lib/turnstile";
import { getPasswordRequirements, validatePasswordStrength } from "../lib/password-strength";

const INPUT_CLASS =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-sky-500/40 focus:bg-white/[0.05] focus:ring-2 focus:ring-sky-500/10";

function defaultUsernameFromEmail(email: string): string {
  const prefix = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return prefix || "user";
}

async function createProfileWithReservedUsername(
  uid: string,
  email: string,
  profileData: Record<string, unknown>
): Promise<string> {
  const base = defaultUsernameFromEmail(email);
  return runTransaction(db, async (transaction) => {
    let username = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const usernameKey = username.toLowerCase();
      const usernameRef = doc(db, "usernames", usernameKey);
      const usernameSnap = await transaction.get(usernameRef);
      if (!usernameSnap.exists() || usernameSnap.data()?.uid === uid) {
        transaction.set(usernameRef, { uid }, { merge: true });
        transaction.set(
          doc(db, "profiles", uid),
          { ...profileData, email, username },
          { merge: true }
        );
        return username;
      }
      username = `${base}${Math.random().toString(36).substring(2, 6)}`.slice(0, 24);
    }
    throw new Error("Could not reserve username");
  });
}

function friendlyAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: string }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try logging in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters with uppercase, lowercase, number, and special character.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return error instanceof Error ? error.message : "Something went wrong";
  }
}

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [canRedirect, setCanRedirect] = useState(false);
  const signupInProgressRef = useRef(false);
  const redirectTo = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
    const redir = params.get("redirect");
    if (redir) redirectTo.current = redir;
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u && !signupInProgressRef.current) setCanRedirect(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !canRedirect || showSignupModal) return;
    const timer = setTimeout(() => router.push(redirectTo.current || "/"), 2000);
    return () => clearTimeout(timer);
  }, [user, canRedirect, redirectTo, router, showSignupModal]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    if (getTurnstileSiteKey() && !turnstileToken) {
      showToast("Complete the security check to continue.", "error");
      return;
    }
    if (getTurnstileSiteKey()) {
      const verifyRes = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyData.success) {
        showToast("Security check failed. Please try again.", "error");
        return;
      }
    }

    if (!acceptedTerms) {
      showToast("Accept the Terms of Service and Privacy Policy to create an account.", "error");
      return;
    }
    
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      showToast(passwordValidation.error || "Password does not meet requirements", "error");
      return;
    }

    const emailCheckRes = await fetch("/api/check-email-temp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const emailCheckData = await emailCheckRes.json().catch(() => ({}));
    if (emailCheckData.disposable) {
      showToast("Temporary email addresses aren't allowed. Use a permanent email.", "error");
      return;
    }

    if (phone.trim()) {
      const formattedPhone = formatNZPhone(phone);
      if (!formattedPhone.startsWith("+642") || formattedPhone.length < 11) {
        showToast("Enter a valid NZ phone number", "error");
        return;
      }
      const phoneRes = await fetch("/api/check-phone-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone }),
      });
      const phoneData = await phoneRes.json().catch(() => ({}));
      if (!phoneRes.ok || !phoneData.available) {
        showToast(phoneData.message || "Phone number already in use.", "error");
        return;
      }
    }

    setLoading(true);
    signupInProgressRef.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const u = cred.user;
      if (u) {
        try {
          await sendEmailVerification(u);
        } catch (e) {
          console.error("Email verification send failed:", e);
        }

        const formattedPhone = phone.trim() ? formatNZPhone(phone) : "";
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const profileData: Record<string, unknown> = {
          phone: formattedPhone,
          phoneVerified: false,
          referralCode: code,
          memberSince: Timestamp.now(),
          lastActive: Timestamp.now(),
          createdAt: serverTimestamp(),
        };

        await createProfileWithReservedUsername(u.uid, u.email || email, profileData);

        if (inviteCode.trim()) {
          try {
            const token = await u.getIdToken();
            const refRes = await fetch("/api/track-referral", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ referralCode: inviteCode.trim().toUpperCase() }),
            });
            const refData = await refRes.json().catch(() => ({}));
            if (refRes.ok && refData.tracked && refData.referredBy) {
              await setDoc(
                doc(db, "profiles", u.uid),
                { referredBy: refData.referredBy },
                { merge: true }
              );
            }
          } catch (e) {
            console.error("Referral tracking failed:", e);
          }
        }

        try {
          const welcomeHtml = buildEmailHtml({
            to: u.email!,
            subject: "Welcome to Sky Drop",
            title: "Welcome to Sky Drop",
            message: "Thanks for joining. Browse anytime — complete KYC when you're ready to sell.",
            ctas: [{ label: "Browse Listings", url: process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz", primary: true }],
          });
          const token = await auth.currentUser?.getIdToken();
          await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ to: u.email, subject: "Welcome to Sky Drop", html: welcomeHtml }),
          });
        } catch {
          /* optional */
        }
      }
      signupInProgressRef.current = false;
      setShowSignupModal(true);
      showToast("Account created! Check your email to verify your address.", "success");
      setEmail("");
      setPassword("");
      setPhone("");
    } catch (error: unknown) {
      signupInProgressRef.current = false;
      showToast(friendlyAuthError(error), "error");
    }
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <div className="absolute inset-0 backdrop-blur-md bg-black/40" />
      <div className="relative z-10">
        <Navbar />
        <Background />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <button
          type="button"
          onClick={() => {
            if (user) {
              router.push(redirectTo.current || "/");
              return;
            }
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-400 transition-all hover:border-sky-500/30 hover:bg-white/[0.06] hover:text-sky-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Left Side - Benefits */}
          <div className="space-y-8">
            <div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/30 to-sky-500/20 text-2xl ring-1 ring-sky-500/30 mb-6">
                ✦
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                Join Sky Drop
              </h1>
              <p className="mt-4 text-lg text-zinc-400 leading-relaxed">
                New Zealand's community marketplace. Buy and sell with confidence.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white">Browse & Buy Immediately</h3>
                  <p className="mt-1 text-sm text-zinc-500">No verification needed to browse and purchase items</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white">Secure Escrow Payments</h3>
                  <p className="mt-1 text-sm text-zinc-500">Your money is protected until you receive your item</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                  <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white">Sell When Ready</h3>
                  <p className="mt-1 text-sm text-zinc-500">Complete verification only when you want to list items</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <p className="text-sm text-zinc-500">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                  Log in here
                </Link>
              </p>
            </div>
          </div>

          {/* Right Side - Signup Form */}
          <div className="relative">
            <div className="login-page-card relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-950/90 to-zinc-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
              <div className="absolute -inset-20 -z-10 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-purple-500/10 blur-3xl opacity-50" />
              
              <div className="relative">
                <h2 className="text-2xl font-black text-white">Create your account</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Start browsing in seconds
                </p>
              </div>

              {!user ? (
                <form onSubmit={handleSignup} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Email</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={INPUT_CLASS}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Password</label>
                    <input
                      type="password"
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={INPUT_CLASS}
                      required
                      disabled={loading}
                    />
                    {password && (
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="text-zinc-500">Password must contain:</p>
                        {getPasswordRequirements(password).map((req, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className={req.met ? "text-green-500" : "text-zinc-500"}>
                              {req.met ? "✓" : "○"}
                            </span>
                            <span className={req.met ? "text-green-500" : "text-zinc-400"}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Phone (optional)</label>
                    <input
                      type="tel"
                      placeholder="+64 2X XXX XXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={INPUT_CLASS}
                      disabled={loading}
                    />
                    <p className="mt-1 text-[10px] text-zinc-600">Optional — NZ format e.g. 021 123 4567 or +64 21 123 4567</p>
                  </div>

                  {inviteCode && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Referral Code</label>
                      <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        className={INPUT_CLASS}
                        disabled={loading}
                      />
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-zinc-400">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500/30"
                        required
                        disabled={loading}
                      />
                      <span className={loading ? "opacity-50" : ""}>
                        I agree to the{" "}
                        <Link href="/terms" className="font-medium text-sky-400 hover:text-sky-300 underline">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="font-medium text-sky-400 hover:text-sky-300 underline">
                          Privacy Policy
                        </Link>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAcceptedTerms(true)}
                      disabled={loading}
                      className="w-full rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/10 hover:text-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      I Agree to Terms & Policy
                    </button>
                  </div>

                  <TurnstileWidget
                    onToken={(token) => setTurnstileToken(token)}
                    onExpire={() => setTurnstileToken("")}
                    className="mb-3 flex justify-center"
                  />

                  <button
                    type="submit"
                    disabled={loading || !acceptedTerms}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3.5 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Creating account..." : "Create account"}
                  </button>

                  <div className="pt-2 text-center">
                    <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
                      Browse without an account →
                    </Link>
                  </div>
                </form>
              ) : (
                <div className="mt-6 space-y-4">
                  <p className="text-sm text-zinc-400">
                    Already signed in as <span className="font-semibold text-white">{user.email}</span>
                  </p>
                  <button
                    onClick={() => router.push(redirectTo.current || "/")}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 py-3 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/30 active:scale-[0.99]"
                  >
                    Continue to home
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {showSignupModal && (
        <SignupVerificationModal
          onClose={() => setShowSignupModal(false)}
          onVerify={() => {
            setShowSignupModal(false);
            router.push("/profile");
          }}
        />
      )}
      </div>
    </main>
  );
}
