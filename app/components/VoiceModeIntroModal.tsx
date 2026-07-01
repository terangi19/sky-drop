"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onGetStarted: (neverAgain: boolean) => void;
  onDismiss: (neverAgain: boolean) => void;
};

export default function VoiceModeIntroModal({ open, onGetStarted, onDismiss }: Props) {
  const [neverAgain, setNeverAgain] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    setNeverAgain(false);
    const t = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss(neverAgain);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, neverAgain, onDismiss]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[10050] flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ${
        visible ? "bg-black/70 backdrop-blur-sm" : "bg-black/0 backdrop-blur-none"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-mode-intro-title"
      onClick={() => onDismiss(neverAgain)}
    >
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0c12]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_60px_rgba(139,92,246,0.12)] transition-all duration-500 ease-out ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-[0.97] opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-500/[0.12] via-sky-500/[0.06] to-transparent" />

        <div className="relative px-8 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-12">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/20 to-sky-500/10 shadow-[0_0_32px_rgba(139,92,246,0.2)]">
            <span className="text-3xl" aria-hidden>
              🎤
            </span>
          </div>

          <div className="space-y-4 text-center">
            <h2 id="voice-mode-intro-title" className="text-2xl font-black tracking-tight text-white">
              Voice Mode
            </h2>
            <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-zinc-400">
              Control Sky Drop with your voice. Just speak naturally to search, navigate, and perform
              actions.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={() => onGetStarted(neverAgain)}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-sky-500 py-3.5 text-sm font-bold text-white shadow-[0_8px_32px_rgba(139,92,246,0.35)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => onDismiss(neverAgain)}
              className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3.5 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white active:scale-[0.98]"
            >
              Not Now
            </button>
          </div>

          <label className="mt-8 flex cursor-pointer items-center justify-center gap-2.5 text-sm text-zinc-500 transition-colors hover:text-zinc-400">
            <input
              type="checkbox"
              checked={neverAgain}
              onChange={(e) => setNeverAgain(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40 focus:ring-offset-0"
            />
            <span>Don&apos;t show this again</span>
          </label>
        </div>
      </div>
    </div>
  );
}
