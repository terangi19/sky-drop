"use client";

import type { AwhinaVoicePhase } from "../hooks/useAwhinaVoice";

type Props = {
  phase: AwhinaVoicePhase;
  voiceMode: boolean;
  paused: boolean;
  headline: string;
  transcript: string;
  hint: string | null;
  heardText: string | null;
  actionText: string | null;
  onDismiss?: () => void;
  onResume?: () => void;
  intro?: string | null;
};

export default function AwhinaVoiceStatusCard({
  phase,
  voiceMode,
  paused,
  headline,
  transcript,
  hint,
  heardText,
  actionText,
  onDismiss,
  onResume,
  intro,
}: Props) {
  if (!voiceMode && phase === "idle") return null;
  if (phase === "idle" && !voiceMode) return null;

  const isListening = phase === "listening";
  const isPaused = phase === "paused" || paused;
  const isProcessing = phase === "processing" || phase === "speaking";
  const isError = phase === "error";
  const isConfirming = phase === "confirming";

  const hasHeardAction = heardText && actionText;

  return (
    <div
      className="awhina-voice-card pointer-events-auto mb-3 w-[min(340px,calc(100vw-2rem))] animate-fade-in-panel"
      role="status"
      aria-live="polite"
    >
      <div
        className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.45)] ${
          isError
            ? "border-amber-500/30 bg-[#121018]/95"
            : isPaused
              ? "border-zinc-500/30 bg-[#101018]/95"
              : isConfirming
                ? "border-amber-400/30 bg-[#121018]/95"
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
                      : isConfirming
                        ? "bg-amber-400/15 text-amber-200"
                        : isListening
                          ? "bg-violet-500/20 text-violet-200"
                          : "bg-sky-500/20 text-sky-200"
                }`}
              >
                {isConfirming ? "?" : isError ? "!" : "🎤"}
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
                        : isConfirming
                          ? "bg-amber-400/20 text-amber-300"
                          : "bg-violet-500/25 text-violet-300 awhina-voice-mode-pill"
                    }`}
                  >
                    {isPaused ? "Paused" : isConfirming ? "Confirm" : "On"}
                  </span>
                )}
              </div>

              {/* Waveform bars when listening */}
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

              {/* Progress bar when processing */}
              {isProcessing && !isListening && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="awhina-voice-progress h-full rounded-full bg-gradient-to-r from-violet-500 via-sky-400 to-violet-500" />
                </div>
              )}

              {/* Visual feedback: Heard → Action */}
              {hasHeardAction && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-zinc-400">
                    <span className="text-zinc-500">Heard:</span>{" "}
                    <span className="text-zinc-200">&ldquo;{heardText}&rdquo;</span>
                  </p>
                  <p className="text-[11px] font-medium text-violet-300">
                    <span className="text-zinc-500">→</span> Opening {actionText}…
                  </p>
                </div>
              )}

              {/* Intro text when first enabling voice mode */}
              {intro && !transcript && !hint && !hasHeardAction && isListening && (
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-300/90">{intro}</p>
              )}

              {/* Transcript display */}
              {transcript && !hasHeardAction && (
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-300/90 line-clamp-3">{transcript}</p>
              )}

              {/* Hint / error / confirmation prompt */}
              {hint && (
                <p
                  className={`mt-1.5 text-[10px] leading-snug ${
                    isError ? "text-amber-300/90" : isConfirming ? "text-amber-200/90" : "text-zinc-500"
                  }`}
                >
                  {hint}
                </p>
              )}

              {/* Resume button when paused */}
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
