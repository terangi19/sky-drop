"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Navbar from "../components/Navbar";
import Background from "../components/Background";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";

import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  // Phone verification step
  const [step, setStep] = useState<"form" | "verify">("form");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const confirmationResultRef = useRef<any>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [redirectTo, setRedirectTo] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setInviteCode(ref.toUpperCase());
    const redir = params.get("redirect");
    if (redir) setRedirectTo(redir);
  }, []);

  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, []);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    try {
      setLoading(true);

      if (isLogin) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        router.push(redirectTo || "/profile");
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        await sendEmailVerification(cred.user);

        // Save basic profile
        const user = auth.currentUser;
        if (user) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          const profileData: Record<string, any> = {
            email: user.email,
            phone,
            phoneVerified: false,
            referralCode: code,
            memberSince: Timestamp.now(),
            lastActive: Timestamp.now(),
            createdAt: serverTimestamp(),
          };
          if (inviteCode.trim()) profileData.referredBy = inviteCode.trim().toUpperCase();
          await setDoc(doc(db, "profiles", user.uid), profileData);
        }

        alert("Account created! A verification email has been sent to your inbox. Please verify to unlock full features.");
        setIsLogin(true);
      }

      setEmail("");
      setPassword("");

    } catch (error: any) {
      console.error(error);
      alert(error.message);
    }

    setLoading(false);
  }

  async function handleResetPassword() {
    if (!email) {
      alert("Enter your email address first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      alert("Password reset email sent! Check your inbox.");
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleVerifyPhone() {
    if (phoneCode.length !== 6) return;
    setPhoneVerifying(true);
    setPhoneMsg("Verifying...");
    try {
      const confirmation = confirmationResultRef.current;
      if (!confirmation) { setPhoneMsg("No code sent."); setPhoneVerifying(false); return; }
      await confirmation.confirm(phoneCode);
      setPhoneMsg("Phone verified!");
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "profiles", user.uid), { phoneVerified: true }, { merge: true });
      }
      setTimeout(() => router.push("/profile"), 800);
    } catch (e: any) {
      setPhoneMsg(e.message || "Invalid code.");
    }
    setPhoneVerifying(false);
  }

  function handleSkip() {
    router.push("/profile");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-[var(--foreground)]">
      <Background />
      <Navbar />

      <section className="relative z-10 mx-auto max-w-md px-6 py-20">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-4xl font-black text-sky-400">
            {step === "verify" ? "Verify Phone" : isLogin ? "Login" : "Create Account"}
          </h1>

          <p className="mt-3 text-[var(--muted)]">
            {step === "verify"
              ? "Enter the 6-digit code sent to your phone."
              : isLogin
              ? "Welcome back to Sky Drop."
              : "Join Sky Drop — phone verification helps keep the marketplace safe."}
          </p>

          {step === "verify" ? (
            <div className="mt-8 space-y-5">
              <input
                type="text"
                placeholder="6-digit code"
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                maxLength={6}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-[var(--foreground)] outline-none focus:border-sky-400"
              />
              {phoneMsg && (
                <p className={`text-center text-sm ${phoneMsg.includes("verified") ? "text-emerald-400" : "text-zinc-400"}`}>
                  {phoneMsg}
                </p>
              )}
              <button
                onClick={handleVerifyPhone}
                disabled={phoneCode.length !== 6 || phoneVerifying}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-4 font-bold transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {phoneVerifying ? "Verifying..." : "Verify Phone"}
              </button>
              <button
                onClick={handleSkip}
                className="w-full text-center text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Skip for now — verify later in Profile
              </button>
            </div>
          ) : (
            <form onSubmit={handleAuth} className="mt-8 space-y-5">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
              />

              {resetSent ? (
                <p className="text-xs text-right text-emerald-400">Reset link sent!</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="w-full text-xs text-right text-[var(--muted)] hover:text-sky-400 transition-colors"
                >
                  Forgot password?
                </button>
              )}

              {!isLogin && (
                <input
                  type="tel"
                  placeholder="Phone (optional) — for pickup coordination"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
                />
              )}

              {!isLogin && (
                <input
                  type="text"
                  placeholder="Referral code (optional)"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-sky-400"
                />
              )}

              {phoneMsg && (
                <p className="text-center text-sm text-[var(--muted)]">{phoneMsg}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-sky-500 px-4 py-4 font-bold transition hover:bg-sky-400 disabled:opacity-50"
              >
                {loading
                  ? "Loading..."
                  : isLogin
                  ? "Login"
                  : "Create Account"}
              </button>

              {isLogin && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowReset(!showReset)}
                    className="text-sm text-sky-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {showReset && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
                  <p className="text-sm text-[var(--muted)] mb-3">
                    Enter your email and we'll send a reset link.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetSent}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold hover:bg-sky-400 disabled:opacity-50"
                    >
                      {resetSent ? "Sent" : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Toggle Login/Signup */}
          {step === "form" && (
            <>
              {isLogin && (
                <button
                  onClick={() => setIsLogin(false)}
                  className="mt-6 w-full text-center text-sm text-sky-400 hover:underline"
                >
                  Need an account? Create one
                </button>
              )}
              {!isLogin && (
                <button
                  onClick={() => setIsLogin(true)}
                  className="mt-6 w-full text-center text-sm text-sky-400 hover:underline"
                >
                  Already have an account? Login
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await signInWithEmailAndPassword(auth, "test@skydrop.nz", "test123456");
                    router.push("/");
                  } catch {
                    try {
                      const cred = await createUserWithEmailAndPassword(auth, "test@skydrop.nz", "test123456");
                      await setDoc(doc(db, "profiles", cred.user.uid), {
                        email: "test@skydrop.nz",
                        username: "tester",
                        phone: "",
                        phoneVerified: false,
                        referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                        memberSince: Timestamp.now(),
                        lastActive: Timestamp.now(),
                        createdAt: serverTimestamp(),
                      });
                      router.push("/");
                    } catch {}
                  }
                  setLoading(false);
                }}
                disabled={loading}
                className="mt-3 w-full rounded-lg border border-dashed border-zinc-700 py-2.5 text-xs font-bold text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-400 disabled:opacity-50"
              >
                {loading ? "..." : "🧪 Test Login (test@skydrop.nz / test123456)"}
              </button>
            </>
          )}
        </div>
      </section>
      <div id="recaptcha-container" />
    </main>
  );
}
