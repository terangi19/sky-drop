"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { auth, onAuthStateChanged } from "../lib/firebase";
import { showToast } from "./Toast";

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
      await sendEmailVerification(user, {
        url: (typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_URL) + "/profile",
      });
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setSending(false);
  }

  if (!user || user.emailVerified || dismissed) return null;

  return (
    <div className="relative z-[99999] flex items-center justify-between gap-4 border-b border-sky-500/15 bg-sky-500/5 px-6 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-sky-400 text-xs">✉</span>
        <span className="text-xs text-[var(--muted)]">
          Verify your email to buy items and secure your account. Check spam for the email.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleResend}
          disabled={sending}
          className="rounded-lg border border-sky-500/20 px-2.5 py-1 text-[11px] font-medium text-sky-400 transition hover:bg-sky-500/10 disabled:opacity-50"
        >
          {sending ? "Sending..." : sent ? "Sent!" : "Send verification"}
        </button>
        <button
          onClick={handleDismiss}
          className="text-[var(--muted)] transition hover:text-[var(--foreground)] text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
