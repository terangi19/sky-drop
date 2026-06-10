"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Navbar from "../components/Navbar";
import Background from "../components/Background";
import LoginKycSection from "../components/LoginKycSection";
import { showToast } from "../components/Toast";

import {
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  type User,
} from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { createNotification } from "../lib/notifications";
import { buildEmailHtml } from "../lib/email";
import { formatNZPhone } from "../lib/phone-auth";
import { isTestLoginUiEnabled } from "../lib/test-login";

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
    const redir = params.get("redirect");
    if (redir) setRedirectTo(redir);
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    if (!isLogin) {
      const pwErrors: string[] = [];
      if (password.length < 8) pwErrors.push("at least 8 characters");
      if (!/[A-Z]/.test(password)) pwErrors.push("an uppercase letter");
      if (!/[0-9]/.test(password)) pwErrors.push("a number");
      if (pwErrors.length > 0) {
        showToast("Password needs " + pwErrors.join(", "), "error");
        return;
      }
      if (phone.trim()) {
        const formattedPhone = formatNZPhone(phone);
        if (!formattedPhone.startsWith("+642") || formattedPhone.length < 11) {
          showToast("Enter a valid NZ phone number", "error");
          return;
        }
        const existingPhone = await getDocs(query(collection(db, "profiles"), where("phone", "==", formattedPhone)));
        if (!existingPhone.empty) {
          showToast("Phone number already in use.", "error");
          return;
        }
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Welcome back!", "success");
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const u = cred.user;
        if (u) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const profileData: Record<string, unknown> = {
            email: u.email,
            username: u.email?.split("@")[0] || "",
            phone: phone.trim() || "",
            phoneVerified: false,
            referralCode: code,
            memberSince: Timestamp.now(),
            lastActive: Timestamp.now(),
            createdAt: serverTimestamp(),
          };
          if (inviteCode.trim()) {
            try {
              const referrerQuery = query(collection(db, "profiles"), where("referralCode", "==", inviteCode.trim().toUpperCase()));
              const referrerSnap = await getDocs(referrerQuery);
              if (!referrerSnap.empty) {
                const referrerDoc = referrerSnap.docs[0];
                const referrerData = referrerDoc.data();
                if (referrerData.email && referrerData.email !== u.email) {
                  profileData.referredBy = inviteCode.trim().toUpperCase();
                  await updateDoc(doc(db, "profiles", referrerDoc.id), { referralSignups: increment(1) });
                  await addDoc(collection(db, "referralEvents"), {
                    type: "signup",
                    referrerEmail: referrerData.email,
                    referredEmail: u.email,
                    createdAt: serverTimestamp(),
                  });
                  await createNotification({
                    type: "referral",
                    targetEmail: referrerData.email,
                    fromEmail: u.email || "",
                    title: "🎉 You referred someone!",
                    message: `${u.email} signed up using your referral code!`,
                  });
                }
              }
            } catch (e) {
              console.error("Referral tracking failed:", e);
            }
          }
          await setDoc(doc(db, "profiles", u.uid), profileData);
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
        showToast("Account created!", "success");
      }
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Something went wrong", "error");
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
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-sky-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {!user && !isLogin ? "Back to login" : "Back"}
        </button>

        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-8 shadow-xl backdrop-blur">
          <h1 className="text-2xl font-black text-white">{isLogin ? "Login" : "Create account"}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Browse and purchase freely. Seller verification is only required to list items.
          </p>

          {!user ? (
            <form onSubmit={handleAuth} className="mt-6 space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-sky-500"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-sky-500"
              />
              {!isLogin && (
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-sky-500"
                />
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-sky-500 py-3 font-bold text-white hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? "Loading…" : isLogin ? "Login" : "Create account"}
              </button>
              <div className="flex justify-between text-xs">
                <Link href="/forgot-password" className="text-zinc-500 hover:text-sky-400">
                  Forgot password?
                </Link>
                <Link href="/" className="text-zinc-500 hover:text-white">
                  Browse listings
                </Link>
              </div>
              {isTestLoginUiEnabled() && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch("/api/test-login", { method: "POST" });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || "Test login failed");
                      await signInWithCustomToken(auth, data.token);
                      showToast("Signed in", "success");
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : "Failed", "error");
                    }
                    setLoading(false);
                  }}
                  className="w-full rounded-xl border border-dashed border-sky-500/40 py-2 text-sm text-sky-400"
                >
                  Test login
                </button>
              )}
            </form>
          ) : (
            <p className="mt-6 text-sm text-zinc-400">
              Signed in as <span className="text-white">{user.email}</span>
            </p>
          )}

          {!user && (
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="mt-4 w-full text-center text-sm text-sky-400 hover:underline"
            >
              {isLogin ? "Need an account? Sign up" : "Already have an account? Login"}
            </button>
          )}

          <LoginKycSection user={user} onKycStatusChange={setKycStatus} />

          {user && kycStatus !== "approved" && (
            <button
              type="button"
              onClick={() => setShowBrowseModal(true)}
              className="mt-4 w-full rounded-xl border border-white/[0.08] py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
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
            className="mx-4 w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">Continue without seller verification?</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              You can browse and buy items without verification. However, you will not be able to list items for sale
              until seller verification is completed.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowBrowseModal(false)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBrowseModal(false);
                  router.push(redirectTo || "/");
                }}
                className="flex-1 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-400"
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
