"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import LoginKycSection from "../components/LoginKycSection";
import { showToast } from "../components/Toast";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
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

const INPUT_CLASS =
  "login-page-input w-full rounded-xl px-4 py-3 text-sm";

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
      return "Password is too weak. Use at least 8 characters with uppercase and a number.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/user-not-found":
      return "No account found with this email. Sign up instead.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return error instanceof Error ? error.message : "Something went wrong";
  }
}

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [redirectTo, setRedirectTo] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [showBrowseModal, setShowBrowseModal] = useState(false);
  const [kycStatus, setKycStatus] = useState("unsubmitted");
  const [canRedirect, setCanRedirect] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const signupInProgressRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
    const redir = params.get("redirect");
    if (redir) setRedirectTo(redir);
    if (params.get("signup") === "1" || params.get("mode") === "signup") {
      setIsLogin(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u && !signupInProgressRef.current) setCanRedirect(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !canRedirect) return;
    const timer = setTimeout(() => router.push(redirectTo || "/"), 1500);
    return () => clearTimeout(timer);
  }, [user, canRedirect, redirectTo, router]);

  async function handleAuth(e: React.FormEvent) {
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

    if (!isLogin) {
      if (!acceptedTerms) {
        showToast("Accept the Terms of Service and Privacy Policy to create an account.", "error");
        return;
      }
      const pwErrors: string[] = [];
      if (password.length < 8) pwErrors.push("at least 8 characters");
      if (!/[A-Z]/.test(password)) pwErrors.push("an uppercase letter");
      if (!/[0-9]/.test(password)) pwErrors.push("a number");
      if (pwErrors.length > 0) {
        showToast("Password needs " + pwErrors.join(", "), "error");
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
    }

    setLoading(true);
    if (!isLogin) signupInProgressRef.current = true;
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        setCanRedirect(true);
        showToast("Welcome back!", "success");
      } else {
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
        setCanRedirect(true);
        showToast("Account created! Check your email to verify your address.", "success");
      }
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      signupInProgressRef.current = false;
      showToast(friendlyAuthError(error), "error");
    }
    setLoading(false);
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-md px-6 py-16 sm:py-20">
        <button
          type="button"
          onClick={() => {
            if (user) {
              router.push(redirectTo || "/");
              return;
            }
            if (!isLogin) {
              setIsLogin(true);
              setPhone("");
              return;
            }
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          className="login-page-muted mb-6 inline-flex items-center gap-2 text-sm transition-colors hover:text-sky-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {!user && !isLogin ? "Back to login" : "Back"}
        </button>

        <div className="login-page-card rounded-2xl border p-8 backdrop-blur-sm">
          <h1 className="login-page-title text-2xl font-black">{isLogin ? "Login" : "Create account"}</h1>
          <p className="login-page-body mt-2 text-sm">
            Browse and purchase freely. Seller verification is only required to list items.
          </p>

          {!user ? (
            <form onSubmit={handleAuth} className="mt-6 space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT_CLASS}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT_CLASS}
              />
              {!isLogin && (
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={INPUT_CLASS}
                />
              )}
              {!isLogin && (
                <label className="login-page-body flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-600"
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" className="login-page-link font-medium underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="login-page-link font-medium underline">
                      Privacy Policy
                    </Link>
                  </span>
                </label>
              )}
              <TurnstileWidget
                onToken={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken("")}
                className="mb-3 flex justify-center"
              />
              <button
                type="submit"
                disabled={loading}
                className="login-page-btn-primary w-full rounded-xl py-3 font-bold transition active:scale-[0.99]"
              >
                {loading ? "Loading…" : isLogin ? "Login" : "Create account"}
              </button>
              {isLogin && process.env.NODE_ENV === "development" && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setLoading(true);
                      const testEmail = process.env.NEXT_PUBLIC_TEST_EMAIL || "test@skydrop.nz";
                      const testPass = process.env.NEXT_PUBLIC_TEST_PASSWORD || "TestPass123";
                      setEmail(testEmail);
                      setPassword(testPass);
                      await signInWithEmailAndPassword(auth, testEmail, testPass);
                      setCanRedirect(true);
                      showToast("Welcome! You're logged in as a test user.", "success");
                    } catch (e: any) {
                      showToast(e?.message || "Test login failed", "error");
                    }
                    setLoading(false);
                  }}
                  className="login-page-btn-secondary mt-2 w-full rounded-xl border py-2.5 text-sm font-semibold transition active:scale-[0.99]"
                >
                  Test Login
                </button>
              )}
              <div className="flex justify-between text-xs">
                <Link href="/forgot-password" className="login-page-link font-medium">
                  Forgot password?
                </Link>
                <Link href="/" className="login-page-link font-medium">
                  Browse listings
                </Link>
              </div>
            </form>
          ) : (
            <p className="login-page-body mt-6 text-sm">
              Signed in as <span className="login-page-title font-semibold">{user.email}</span>
            </p>
          )}

          {!user && (
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                if (isLogin) setAcceptedTerms(false);
              }}
              className="login-page-link mt-4 w-full text-center text-sm font-medium hover:underline"
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Login"}
            </button>
          )}

          <LoginKycSection user={user} onKycStatusChange={setKycStatus} />

          {user && kycStatus !== "approved" && (
            <button
              type="button"
              onClick={() => setShowBrowseModal(true)}
              className="login-page-btn-secondary mt-4 w-full rounded-xl border py-2.5 text-sm font-semibold"
            >
              Browse without verification
            </button>
          )}
        </div>
      </section>

      {showBrowseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-backdrop"
          onClick={() => setShowBrowseModal(false)}
        >
          <div
            className="login-page-modal mx-4 w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="login-page-title text-lg font-bold">Continue without seller verification?</h3>
            <p className="login-page-body mt-3 text-sm leading-relaxed">
              You can browse and buy items without verification. However, you will not be able to list items for sale
              until seller verification is completed.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowBrowseModal(false)}
                className="login-page-btn-secondary flex-1 rounded-xl border py-3 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBrowseModal(false);
                  router.push(redirectTo || "/");
                }}
                className="login-page-btn-primary flex-1 rounded-xl py-3 text-sm font-semibold"
              >
                Continue browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

