"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, sendEmailVerification } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function VerificationBanner() {
  const [user, setUser] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("verificationBannerDismissed") === "true") {
        setDismissed(true);
      }
    } catch {}
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem("verificationBannerDismissed", "true");
    } catch {}
  }

  async function handleResend() {
    if (!user || sending) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e: any) {
      alert(e.message);
    }
    setSending(false);
  }

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <div className="relative z-[99999] flex items-center justify-between gap-4 border-b border-amber-500/20 bg-amber-500/10 px-6 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">&#9888;</span>
        <span className="text-[var(--foreground)]">
          Please verify your email to unlock full Sky Drop features.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleResend}
          disabled={sending}
          className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-400 transition hover:bg-amber-500/10 disabled:opacity-50"
        >
          {sending ? "Sending..." : sent ? "Sent!" : "Resend verification"}
        </button>
        <button
          onClick={handleDismiss}
          className="text-[var(--muted)] transition hover:text-[var(--foreground)]"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
