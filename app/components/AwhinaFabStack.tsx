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
      className={`fixed z-[10002] flex flex-col items-end pointer-events-none bottom-5 right-5 max-md:bottom-20 max-md:right-3 ${className}`}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-2.5">
        <div className="group relative">
          <span className="awhina-chat-fab-tooltip absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-zinc-900/90 border border-white/[0.04] text-[10px] font-medium text-zinc-300 whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            {voiceMode ? (paused ? "Resume" : "On") : supported ? "Voice" : "Unavailable"}
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-zinc-900/90 border-r border-b border-white/[0.04]" />
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
            className={`relative flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 active:scale-95 disabled:opacity-50 ${
              voiceMode
                ? paused
                  ? "border-zinc-500/30 bg-zinc-800/30"
                  : "border-violet-400/40 bg-violet-500/15 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
                : micGlow
                  ? "border-violet-400/35 bg-violet-500/10 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                  : "border-white/[0.06] bg-[#0c0e14]/80 shadow-[0_0_12px_rgba(139,92,246,0.06)] hover:scale-105 hover:border-violet-400/25 hover:shadow-[0_0_18px_rgba(139,92,246,0.15)] light:border-gray-200/80 light:bg-white/95 light:shadow-[0_2px_12px_rgba(15,23,42,0.06)]"
            }`}
          >
            {voiceActive && (
              <>
                <span className="awhina-voice-ring absolute inset-0 rounded-full border border-violet-400/30" />
                <span className="awhina-voice-ring awhina-voice-ring-delay absolute inset-0 rounded-full border border-sky-400/20" />
              </>
            )}
            {voiceMode && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
            )}
            <span
              className={`relative flex h-5.5 w-5.5 items-center justify-center rounded-full text-[10px] ${
                voiceMode
                  ? "bg-gradient-to-br from-violet-400 to-sky-500 shadow-[0_0_8px_rgba(139,92,246,0.25)]"
                  : "bg-gradient-to-br from-violet-500/70 to-sky-500/70"
              }`}
            >
              🎤
            </span>
          </button>
          {voiceMode && (
            <span className="mt-0.5 block text-center text-[7px] font-semibold uppercase tracking-wide text-emerald-400/70">
              {paused ? "Paused" : "Live"}
            </span>
          )}
        </div>

        {!chatHidden && (
          <div className="group relative">
            <span className="awhina-chat-fab-tooltip absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-zinc-900/90 border border-white/[0.04] text-[10px] font-medium text-zinc-300 whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
              Chat
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-zinc-900/90 border-r border-b border-white/[0.04]" />
            </span>
            <button
              type="button"
              onClick={onOpenChat}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-[#0c0e14]/80 backdrop-blur-xl shadow-[0_0_14px_rgba(14,165,233,0.08)] transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:border-sky-400/30 active:scale-95 light:border-gray-200/80 light:bg-white/95 light:shadow-[0_2px_16px_rgba(14,165,233,0.08)]`}
              aria-label={`Open ${AWHINA_ASK_LABEL}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-500 text-xs shadow-[0_0_8px_rgba(14,165,233,0.15)]">
                ✦
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
