"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaInsight, AwhinaInsightAction } from "../lib/awhina-insights";
import AwhinaAvatar from "./AwhinaAvatar";

const PREFERS_REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = {
  intro: string[];
  insight?: AwhinaInsight | null;
  className?: string;
};

type TypedLine = {
  text: string;
  variant: "intro-primary" | "intro-secondary" | "insight";
};

function lineClass(variant: TypedLine["variant"]): string {
  if (variant === "intro-primary") return "text-sm font-medium text-always-white";
  if (variant === "intro-secondary") return "text-[13px] text-always-white/90";
  return "text-[13px] text-always-white/90";
}

function InsightAction({ action }: { action: AwhinaInsightAction }) {
  const className = action.primary
    ? "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-3.5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(56,189,248,0.22)] transition hover:brightness-110 active:scale-[0.98]"
    : "inline-flex items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-always-white backdrop-blur-sm transition hover:border-sky-500/25 hover:bg-white/[0.1] active:scale-[0.98]";

  if (action.type === "link") {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }

  if (action.type === "button") {
    return (
      <button type="button" onClick={action.onClick} className={className}>
        {action.label}
      </button>
    );
  }

  return null;
}

export default function AwhinaInsightCard({ intro, insight, className = "mb-6 sm:mb-8" }: Props) {
  const showCategory = insight && insight.label !== AWHINA_NAME;

  const typedLines = useMemo(() => {
    const lines: TypedLine[] = intro.map((text, i) => ({
      text,
      variant: i === 0 ? "intro-primary" : "intro-secondary",
    }));
    if (insight?.message) {
      lines.push({ text: insight.message, variant: "insight" });
    }
    return lines;
  }, [intro, insight?.message]);

  const linesKey = typedLines.map((l) => l.text).join("\n");
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLineIndex(0);
    setCharIndex(0);
    setDone(false);
  }, [linesKey]);

  useEffect(() => {
    if (done || typedLines.length === 0) return;
    
    // Skip typing animation for reduced motion or screen readers
    if (PREFERS_REDUCED_MOTION) {
      setLineIndex(typedLines.length - 1);
      setCharIndex(typedLines[typedLines.length - 1]?.text.length || 0);
      setDone(true);
      return;
    }
    
    const current = typedLines[lineIndex]?.text || "";
    if (charIndex < current.length) {
      const startTime = performance.now();
      const targetDelay = 18;
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        if (elapsed >= targetDelay) {
          setCharIndex((c) => c + 1);
        } else {
          requestAnimationFrame(animate);
        }
      };
      const rafId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafId);
    }
    if (lineIndex < typedLines.length - 1) {
      const startTime = performance.now();
      const targetDelay = 420;
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        if (elapsed >= targetDelay) {
          setLineIndex((i) => i + 1);
          setCharIndex(0);
        } else {
          requestAnimationFrame(animate);
        }
      };
      const rafId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafId);
    }
    setDone(true);
  }, [charIndex, lineIndex, typedLines, done, linesKey]);

  const speaking = !done;
  const visibleLines = typedLines.slice(0, lineIndex + 1);
  const currentLine = typedLines[lineIndex];
  const typedCurrent = currentLine?.text.slice(0, charIndex) || "";

  return (
    <div
      className={`awhina-panel relative overflow-hidden rounded-2xl border border-sky-500/20 bg-zinc-950/50 shadow-[0_12px_40px_rgba(14,165,233,0.08)] backdrop-blur-2xl light:border-sky-600/20 light:bg-white/95 light:shadow-[0_12px_40px_rgba(14,165,233,0.12)] ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent light:via-sky-600/30" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.12),transparent_60%)] light:bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.08),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.05),transparent_55%)] light:bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.03),transparent_55%)]" />

      <div className="relative flex gap-3.5 p-3.5 sm:gap-4 sm:p-4">
        <AwhinaAvatar speaking={speaking} />

        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-always-white light:text-gray-800">
              {AWHINA_NAME} · <span className="text-emerald-400 light:text-emerald-600">online</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 light:border-emerald-600/20 light:bg-emerald-500/10">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-always-white light:text-gray-700">
                Live
              </span>
            </span>
          </div>

          <div className="awhina-panel-bubble rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2.5 light:border-gray-300/30 light:bg-gray-100/80">
            <div className="space-y-1">
              {visibleLines.slice(0, -1).map((line, i) => (
                <p key={i} className={`leading-snug ${lineClass(line.variant)}`}>
                  {line.text}
                </p>
              ))}
              {currentLine && (
                <p className={`leading-snug ${lineClass(currentLine.variant)}`}>
                  {typedCurrent}
                  {speaking && (
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] awhina-cursor-blink bg-sky-400 align-middle light:bg-sky-600" />
                  )}
                </p>
              )}
            </div>
          </div>

          {insight && done && (
            <div className="mt-3 border-t border-white/[0.06] pt-3 light:border-gray-300/30">
              {showCategory && (
                <p className="mb-1 text-[10px] font-medium text-always-white/80 light:text-gray-600">
                  {insight.icon} {insight.label}
                </p>
              )}
              {insight.actions && insight.actions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {insight.actions.map((action) => (
                    <InsightAction key={action.label} action={action} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
