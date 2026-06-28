"use client";

import type { AwhinaVoicePhase } from "../hooks/useAwhinaVoice";

type Props = {
  phase: AwhinaVoicePhase;
  voiceMode: boolean;
  paused: boolean;
  headline: string;
  transcript: string;
  hint: string | null;
  onDismiss?: () => void;
  onResume?: () => void;
};

export default function AwhinaVoiceStatusCard({
  phase,
  voiceMode,
  paused,
  headline,
  transcript,
  hint,
  onDismiss,
  onResume,
}: Props) {
  if (!voiceMode && phase === "idle") return null;
  if (phase === "idle" && !voiceMode) return null;

  const isListening = phase === "listening";
  const isPaused = phase === "paused" || paused;
  const isProcessing = phase === "processing" || phase === "speaking";
  const isError = phase === "error";

  return (
    <div
      className="awhina-voice-card pointer-events-auto mb-3 w-[min(320px,calc(100vw-2rem))] animate-fade-in-panel"
      role="status"
      aria-live="polite"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.45)] ${
          isError
            ? "border-amber-500/30 bg-[#121018]/95"
            : isPaused
              ? "border-zinc-500/30 bg-[#101018]/95"
              : "border-violet-400/25 bg-[#0c0e16]/95"
        }`}
      >
        {!isError && !isPaused && (
          <div
            className={`absolute inset-0 opacity-60 ${
              isListening ? "awhina-voice-card-glow-listening" : "awhina-voice-card-glow-processing"
            }`}
            aria-hidden
          />
        )}

        <div className="relative px-4 py-3.5">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center">
              {isListening && (
                <>
                  <span className="awhina-voice-ring absolute inset-0 rounded-full border border-violet-400/50" />
                  <span className="awhina-voice-ring awhina-voice-ring-delay absolute inset-0 rounded-full border border-sky-400/35" />
                </>
              )}
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-base ${
                  isError
                    ? "bg-amber-500/15 text-amber-300"
                    : isPaused
                      ? "bg-zinc-500/15 text-zinc-300"
                      : isListening
                        ? "bg-violet-500/20 text-violet-200"
                        : "bg-sky-500/20 text-sky-200"
                }`}
              >
                🎤
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-bold text-always-white">{headline}</p>
                {voiceMode && !isError && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                      isPaused
                        ? "bg-zinc-500/20 text-zinc-400"
                        : "bg-violet-500/25 text-violet-300 awhina-voice-mode-pill"
                    }`}
                  >
                    {isPaused ? "Paused" : "On"}
                  </span>
                )}
              </div>

              {isListening && (
                <div className="mt-2 flex h-5 items-end gap-0.5" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="awhina-voice-bar w-1 rounded-full bg-gradient-to-t from-violet-500 to-sky-400"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </div>
              )}

              {isProcessing && !isListening && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="awhina-voice-progress h-full rounded-full bg-gradient-to-r from-violet-500 via-sky-400 to-violet-500" />
                </div>
              )}

              {transcript && (
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-300/90 line-clamp-3">{transcript}</p>
              )}

              {hint && (
                <p
                  className={`mt-1.5 text-[10px] leading-snug ${
                    isError ? "text-amber-300/90" : "text-zinc-500"
                  }`}
                >
                  {hint}
                </p>
              )}

              {isPaused && onResume && (
                <button
                  type="button"
                  onClick={onResume}
                  className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-200 hover:bg-violet-500/20"
                >
                  Resume listening
                </button>
              )}
            </div>

            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
                aria-label="Turn off Voice Mode"
                title="Turn off Voice Mode"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
