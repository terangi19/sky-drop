"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AwhinaVoicePhase } from "../hooks/useAwhinaVoice";

type Props = {
  phase: AwhinaVoicePhase;
  voiceMode: boolean;
  paused: boolean;
  headline: string;
  transcript: string;
  hint: string | null;
};

const STATE_LABELS: Record<string, string> = {
  listening: "Listening",
  processing: "Thinking",
  speaking: "Responding",
};

const BAR_HEIGHT = 64;

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  values: Float64Array,
  width: number,
  height: number,
  gradient: CanvasGradient
) {
  const len = values.length;
  const mid = height / 2;
  const step = width / (len - 1);

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(0, mid);

  for (let i = 0; i < len; i++) {
    const x = i * step;
    const y = mid + values[i] * mid * 0.85;
    if (i === 0) ctx.lineTo(x, y);
    else {
      const prevX = (i - 1) * step;
      const cpx = (prevX + x) / 2;
      ctx.quadraticCurveTo(cpx, mid + values[i - 1] * mid * 0.85, x, y);
    }
  }

  ctx.lineTo(width, mid);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function createGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, "rgba(139, 92, 246, 0.7)");
  grad.addColorStop(0.5, "rgba(56, 189, 248, 0.8)");
  grad.addColorStop(1, "rgba(139, 92, 246, 0.7)");
  return grad;
}

export default function AwhinaVoiceBar({
  phase,
  voiceMode,
  paused,
  headline,
  transcript,
  hint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valuesRef = useRef(new Float64Array(80));
  const targetsRef = useRef(new Float64Array(80));
  const rafRef = useRef(0);

  const active = voiceMode && !paused && phase !== "idle";

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const vals = valuesRef.current;
    const targets = targetsRef.current;
    const len = vals.length;

    const isQuiet = phase === "processing" || phase === "speaking";
    const amp = phase === "speaking" ? 0.55 : phase === "processing" ? 0.18 : 0.35;
    const speed = phase === "speaking" ? 0.15 : phase === "processing" ? 0.04 : 0.08;

    for (let i = 0; i < len; i++) {
      if (Math.random() < (isQuiet ? 0.02 : 0.06)) {
        targets[i] = (Math.random() - 0.5) * 2 * amp;
      }
      vals[i] += (targets[i] - vals[i]) * speed;
      vals[i] *= 0.998;
    }

    const grad = createGradient(ctx, width, height);
    drawWaveform(ctx, vals, width, height, grad);

    rafRef.current = requestAnimationFrame(animate);
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.clientWidth * devicePixelRatio;
      canvas.height = BAR_HEIGHT * devicePixelRatio;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${BAR_HEIGHT}px`;
      canvas.getContext("2d")?.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const vals = valuesRef.current;
    for (let i = 0; i < vals.length; i++) {
      vals[i] = (Math.random() - 0.5) * 0.05;
      targetsRef.current[i] = 0;
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  const stateLabel = paused
    ? "Paused"
    : phase === "error"
      ? "Voice unavailable"
      : STATE_LABELS[phase] || "";

  const showBar = voiceMode && phase !== "idle";
  const showTranscript = (transcript || hint) && active;

  return (
    <div
      className={`fixed left-0 right-0 z-[9998] transition-all duration-500 ease-out ${
        showBar ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"
      }`}
      style={{ top: "64px" }}
    >
      <div
        className={`relative mx-auto overflow-hidden backdrop-blur-xl border-b transition-all duration-500 ${
          phase === "error"
            ? "border-amber-500/25 bg-amber-500/[0.04]"
            : paused
              ? "border-zinc-500/20 bg-zinc-950/60"
              : "border-violet-400/20 bg-[#0c0e16]/70"
        }`}
      >
        {phase !== "error" && !paused && (
          <div
            className={`absolute inset-0 transition-opacity duration-700 ${
              phase === "listening"
                ? "bg-gradient-to-r from-violet-500/[0.03] via-sky-400/[0.05] to-violet-500/[0.03]"
                : phase === "processing"
                  ? "bg-gradient-to-r from-sky-500/[0.04] via-violet-400/[0.06] to-sky-500/[0.04]"
                  : "bg-gradient-to-r from-violet-500/[0.04] via-sky-400/[0.07] to-violet-500/[0.04]"
            }`}
          />
        )}

        {showBar && (
          <div className="relative mx-auto flex h-16 items-center gap-4 px-4 md:px-6 lg:max-w-7xl">
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                className={`relative flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all duration-500 ${
                  phase === "error"
                    ? "bg-amber-500/15"
                    : paused
                      ? "bg-zinc-500/15"
                      : phase === "listening"
                        ? "bg-violet-500/20 shadow-[0_0_16px_rgba(139,92,246,0.25)]"
                        : phase === "processing"
                          ? "bg-sky-500/20 shadow-[0_0_16px_rgba(56,189,248,0.2)]"
                          : "bg-violet-500/20 shadow-[0_0_16px_rgba(139,92,246,0.25)]"
                }`}
              >
                {phase === "listening" && (
                  <>
                    <span className="absolute inset-0 rounded-full border border-violet-400/40 animate-ping" style={{ animationDuration: "2s" }} />
                    <span className="absolute inset-0 rounded-full border border-sky-400/25 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.6s" }} />
                  </>
                )}
                <span className="relative">
                  {phase === "processing" ? "✦" : phase === "speaking" ? "✦" : "🎤"}
                </span>
              </span>

              <div className="flex flex-col">
                <span
                  className={`text-[11px] font-bold tracking-wide transition-colors duration-300 ${
                    phase === "error"
                      ? "text-amber-300"
                      : paused
                        ? "text-zinc-400"
                        : "text-violet-200"
                  }`}
                >
                  {phase === "processing" ? (
                    <span className="inline-flex items-center gap-1.5">
                      Thinking
                      <span className="inline-flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "0s", animationDuration: "1s" }} />
                        <span className="h-1 w-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "0.15s", animationDuration: "1s" }} />
                        <span className="h-1 w-1 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "1s" }} />
                      </span>
                    </span>
                  ) : phase === "speaking" ? (
                    <span className="text-sky-300">Responding</span>
                  ) : (
                    stateLabel
                  )}
                </span>
                <span className="text-[9px] font-medium text-zinc-500 tracking-wider uppercase">
                  {phase === "listening" ? "Voice" : phase === "processing" ? "Processing" : phase === "speaking" ? "Voice" : "Voice"}
                </span>
              </div>
            </div>

            {showTranscript && (
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="truncate text-[12px] text-zinc-300/80">
                  {transcript || hint}
                </p>
              </div>
            )}

            <div className="ml-auto hidden flex-1 md:block" style={{ maxWidth: "min(360px, 30vw)" }}>
              <canvas
                ref={canvasRef}
                className="block w-full"
                style={{ height: BAR_HEIGHT }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
