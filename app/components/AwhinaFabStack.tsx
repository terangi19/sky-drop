"use client";

import { AWHINA_ASK_LABEL, AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  onToggle?: () => void;
  chatHidden?: boolean;
  className?: string;
};

export default function AwhinaFabStack({ voice, onOpenChat, onToggle, chatHidden, className = "" }: Props) {
  const {
    phase,
    voiceMode,
    paused,
    toggle,
    supported,
  } = voice;
  const handleToggle = onToggle ?? toggle;

  const voiceActive = voiceMode && !paused;
  const micGlow = voiceMode || phase === "listening" || phase === "processing";

  return (
    <div
      className={`fixed z-[10002] flex flex-col items-end pointer-events-none bottom-6 right-6 max-md:bottom-24 max-md:right-4 ${className}`}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <div className="group relative">
          <span className="awhina-chat-fab-tooltip absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {voiceMode ? (paused ? "Resume Voice Mode" : "Voice Mode Enabled") : supported ? "Turn on Voice Mode" : "Voice unavailable"}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
          </span>
          <button
            type="button"
            onClick={handleToggle}
            disabled={!supported && !voiceMode}
            aria-label={
              voiceMode
                ? paused
                  ? "Resume Voice Mode"
                  : "Turn off Voice Mode"
                : "Turn on Voice Mode"
            }
            aria-pressed={voiceMode}
            className={`relative flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-300 active:scale-95 disabled:opacity-50 ${
              voiceMode
                ? paused
                  ? "border-zinc-500/40 bg-zinc-800/40"
                  : "border-violet-400/55 bg-violet-500/20 shadow-[0_0_28px_rgba(139,92,246,0.4)]"
                : micGlow
                  ? "border-violet-400/50 bg-violet-500/15 shadow-[0_0_24px_rgba(139,92,246,0.35)]"
                  : "border-white/[0.08] bg-[#0c0e14]/85 shadow-[0_0_16px_rgba(139,92,246,0.1)] hover:scale-110 hover:border-violet-400/35 hover:shadow-[0_0_24px_rgba(139,92,246,0.24)]"
            }`}
          >
            {voiceActive && (
              <>
                <span className="awhina-voice-ring absolute inset-0 rounded-full border border-violet-400/40" />
                <span className="awhina-voice-ring awhina-voice-ring-delay absolute inset-0 rounded-full border border-sky-400/25" />
              </>
            )}
            {voiceMode && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            )}
            <span
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                voiceMode
                  ? "bg-gradient-to-br from-violet-400 to-sky-500 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                  : "bg-gradient-to-br from-violet-500/80 to-sky-500/80"
              }`}
            >
              🎤
            </span>
          </button>
          {voiceMode && (
            <span className="mt-0.5 block text-center text-[8px] font-bold uppercase tracking-wider text-emerald-400/80">
              {paused ? "Paused" : "Live"}
            </span>
          )}
        </div>

        {!chatHidden && (
          <div className="group relative">
            <span className="awhina-chat-fab-tooltip absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              Ask {AWHINA_NAME}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
            </span>
            <button
              type="button"
              onClick={onOpenChat}
              className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/[0.06] bg-[#0c0e14]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(14,165,233,0.12)] transition-all duration-300 hover:scale-110 hover:shadow-[0_0_35px_rgba(14,165,233,0.3)] hover:border-sky-400/40 active:scale-95"
              aria-label={`Open ${AWHINA_ASK_LABEL}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-sm shadow-[0_0_12px_rgba(14,165,233,0.2)]">
                ✦
              </span>
            </button>
            <span className="mt-1 block text-center text-[9px] font-bold uppercase tracking-wider text-sky-300/80">
              {AWHINA_NAME}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
