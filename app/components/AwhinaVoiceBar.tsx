"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AwhinaVoicePhase } from "../hooks/useAwhinaVoice";

type Props = {
  phase: AwhinaVoicePhase;
  voiceMode: boolean;
  paused: boolean;
  toggle: () => void;
};

const BAR_H = 40;

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  values: Float64Array,
  width: number,
  height: number
) {
  const len = values.length;
  const mid = height / 2;
  const step = width / (len - 1);

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let i = 0; i < len; i++) {
    const x = i * step;
    const y = mid + values[i] * mid * 0.9;
    if (i === 0) ctx.lineTo(x, y);
    else {
      const px = (i - 1) * step;
      ctx.quadraticCurveTo((px + x) / 2, mid + values[i - 1] * mid * 0.9, x, y);
    }
  }
  ctx.lineTo(width, mid);

  ctx.strokeStyle = "rgba(139, 92, 246, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, "rgba(139, 92, 246, 0)");
  grad.addColorStop(0.3, "rgba(56, 189, 248, 0.06)");
  grad.addColorStop(0.7, "rgba(56, 189, 248, 0.06)");
  grad.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = grad;
  ctx.fill();
}

export default function AwhinaVoiceBar({ phase, voiceMode, paused, toggle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valsRef = useRef(new Float64Array(100));
  const tgtRef = useRef(new Float64Array(100));
  const rafRef = useRef(0);

  const active = voiceMode && !paused && phase !== "idle";

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const vals = valsRef.current;
    const tgt = tgtRef.current;
    const len = vals.length;

    const isThinking = phase === "processing";
    const isResponding = phase === "speaking";
    const amp = isResponding ? 0.6 : isThinking ? 0.15 : 0.4;
    const speed = isResponding ? 0.18 : isThinking ? 0.035 : 0.09;
    const flip = isThinking ? 0.015 : isResponding ? 0.1 : 0.05;

    for (let i = 0; i < len; i++) {
      if (Math.random() < flip) {
        tgt[i] = (Math.random() - 0.5) * 2 * amp;
      }
      vals[i] += (tgt[i] - vals[i]) * speed;
      vals[i] *= 0.996;
    }

    drawWaveform(ctx, vals, w, h);
    rafRef.current = requestAnimationFrame(animate);
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const w = parent.clientWidth;
      canvas.width = w * devicePixelRatio;
      canvas.height = BAR_H * devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${BAR_H}px`;
      canvas.getContext("2d")?.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const vals = valsRef.current;
    for (let i = 0; i < vals.length; i++) {
      vals[i] = 0;
      tgtRef.current[i] = 0;
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  return (
    <>
      {/* Thin accent glow — always visible when voice mode is on */}
      {voiceMode && (
        <div className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none">
          <div
            className={`h-[1px] w-full transition-all duration-700 ${
              active
                ? "bg-gradient-to-r from-transparent via-violet-400/40 via-sky-400/30 to-transparent"
                : "bg-gradient-to-r from-transparent via-violet-400/15 to-transparent"
            }`}
          />
        </div>
      )}

      {/* Waveform strip */}
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] pointer-events-none transition-all duration-500 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          {/* Waveform canvas — grows from right, fills most of width */}
          <div
            className="absolute right-12 top-1/2 -translate-y-1/2 overflow-hidden transition-all duration-700 ease-out"
            style={{
              width: active ? "calc(100% - 80px)" : "0px",
              opacity: active ? 1 : 0,
            }}
          >
            <canvas
              ref={canvasRef}
              className="block"
              style={{ width: "100%", height: BAR_H }}
            />
          </div>
        </div>
      </div>

      {/* Mic indicator — top-right, inside navbar visual space */}
      <button
        type="button"
        onClick={toggle}
        aria-label={voiceMode ? "Turn off Voice Mode" : "Turn on Voice Mode"}
        className={`fixed z-[10001] transition-all duration-500 cursor-pointer ${
          voiceMode
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
        style={{ top: "12px", right: "16px" }}
      >
        <div className="relative flex items-center justify-center h-8 w-8">
          {active && (
            <>
              <span
                className="absolute inset-0 rounded-full border border-violet-400/30 animate-ping"
                style={{ animationDuration: "2s" }}
              />
              <span
                className="absolute inset-0 rounded-full border border-sky-400/20 animate-ping"
                style={{ animationDuration: "2s", animationDelay: "0.6s" }}
              />
            </>
          )}
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-violet-500/15 text-[10px]">
            🎤
          </span>
          <span
            className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.5)] transition-colors duration-500 ${
              paused ? "bg-zinc-400" : active ? "bg-emerald-400" : "bg-emerald-400/60"
            }`}
          />
        </div>
      </button>
    </>
  );
}
