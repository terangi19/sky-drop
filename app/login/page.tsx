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
const INPUT_CLASS =
  "login-page-input w-full rounded-xl px-4 py-3 text-sm";

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

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => router.push(redirectTo || "/"), 1500);
    return () => clearTimeout(timer);
  }, [user, redirectTo, router]);

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
              <button
                type="submit"
                disabled={loading}
                className="login-page-btn-primary w-full rounded-xl py-3 font-bold transition active:scale-[0.99]"
              >
                {loading ? "Loading…" : isLogin ? "Login" : "Create account"}
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
          ) : (
            <p className="login-page-body mt-6 text-sm">
              Signed in as <span className="login-page-title font-semibold">{user.email}</span>
            </p>
          )}

          {!user && (
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
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

