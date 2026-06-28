"use client";

import { AWHINA_ASK_LABEL, AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaVoiceState } from "../hooks/useAwhinaVoice";
import AwhinaVoiceStatusCard from "./AwhinaVoiceStatusCard";

type Props = {
  voice: AwhinaVoiceState;
  onOpenChat: () => void;
  chatHidden?: boolean;
  className?: string;
};

export default function AwhinaFabStack({ voice, onOpenChat, chatHidden, className = "" }: Props) {
  const { phase, listening, headline, transcript, hint, toggle, cancel, supported } = voice;
  const voiceActive = phase !== "idle" || listening;

  return (
    <div
      className={`fixed z-[10002] flex flex-col items-end pointer-events-none bottom-6 right-6 max-md:bottom-24 max-md:right-4 ${className}`}
    >
      <AwhinaVoiceStatusCard
        phase={phase}
        headline={headline}
        transcript={transcript}
        hint={hint}
        onDismiss={voiceActive ? cancel : undefined}
      />

      <div className="pointer-events-auto flex flex-col items-center gap-3">
        {/* Voice */}
        <div className="group relative">
          <span className="awhina-chat-fab-tooltip absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {supported ? "Āwhina Voice" : "Voice unavailable"}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
          </span>
          <button
            type="button"
            onClick={toggle}
            disabled={!supported && phase === "idle"}
            aria-label={listening ? "Stop voice input" : "Start Āwhina voice"}
            aria-pressed={listening}
            className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-300 active:scale-95 disabled:opacity-50 ${
              voiceActive
                ? "border-violet-400/50 bg-violet-500/15 shadow-[0_0_32px_rgba(139,92,246,0.45)] scale-105"
                : "border-white/[0.08] bg-[#0c0e14]/85 shadow-[0_0_20px_rgba(139,92,246,0.12)] hover:scale-110 hover:border-violet-400/35 hover:shadow-[0_0_28px_rgba(139,92,246,0.28)]"
            }`}
          >
            {voiceActive && (
              <>
                <span className="awhina-voice-ring absolute inset-0 rounded-full border border-violet-400/40" />
                <span className="awhina-voice-ring awhina-voice-ring-delay absolute inset-0 rounded-full border border-sky-400/25" />
              </>
            )}
            <span
              className={`relative flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                voiceActive
                  ? "bg-gradient-to-br from-violet-400 to-sky-500 shadow-[0_0_14px_rgba(139,92,246,0.35)]"
                  : "bg-gradient-to-br from-violet-500/80 to-sky-500/80"
              }`}
            >
              🎤
            </span>
          </button>
          <span className="mt-1 block text-center text-[9px] font-bold uppercase tracking-wider text-violet-300/80">
            Voice
          </span>
        </div>

        {/* Āwhina chat */}
        {!chatHidden && (
          <div className="group relative">
            <span className="awhina-chat-fab-tooltip absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-zinc-900/95 border border-white/[0.06] text-[11px] font-semibold text-always-white whitespace-nowrap shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              Ask {AWHINA_NAME}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900/95 border-r border-b border-white/[0.06]" />
            </span>
            <button
              type="button"
              onClick={onOpenChat}
              className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full border border-white/[0.06] bg-[#0c0e14]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(14,165,233,0.12)] transition-all duration-300 hover:scale-110 hover:shadow-[0_0_35px_rgba(14,165,233,0.3)] hover:border-sky-400/40 active:scale-95"
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
