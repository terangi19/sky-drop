"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AWHINA_NAME } from "../lib/awhina-brand";
import type { AwhinaInsight, AwhinaInsightAction } from "../lib/awhina-insights";

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
  if (variant === "intro-primary") return "text-sm font-medium text-zinc-100";
  if (variant === "intro-secondary") return "text-[13px] text-zinc-400";
  return "text-[13px] text-sky-100/90";
}

function AwhinaAvatar({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative shrink-0">
      <div
        className={`absolute -inset-2 rounded-2xl bg-sky-400/15 blur-lg transition-opacity duration-500 ${
          speaking ? "opacity-100" : "opacity-40"
        }`}
      />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-400/25 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_0_24px_rgba(56,189,248,0.18)]">
        <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
          <rect x="14" y="18" width="36" height="30" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
          <line x1="32" y1="10" x2="32" y2="18" stroke="#38bdf8" strokeWidth="2" />
          <circle cx="32" cy="8" r="3" fill="#38bdf8" className={speaking ? "animate-pulse" : ""} />
          <circle cx="24" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <circle cx="40" cy="30" r="4" fill="#0ea5e9" className={speaking ? "animate-pulse" : ""} />
          <rect x="22" y="40" width="20" height="4" rx="2" fill="#38bdf8" opacity="0.85" />
        </svg>
      </div>
    </div>
  );
}

function InsightAction({ action }: { action: AwhinaInsightAction }) {
  const className = action.primary
    ? "inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 px-3.5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(56,189,248,0.22)] transition hover:brightness-110 active:scale-[0.98]"
    : "inline-flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-zinc-300 backdrop-blur-sm transition hover:border-sky-500/25 hover:bg-white/[0.07] hover:text-white active:scale-[0.98]";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }

  if (!action.onClick) return null;

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
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
    const current = typedLines[lineIndex]?.text || "";
    if (charIndex < current.length) {
      const t = window.setTimeout(() => setCharIndex((c) => c + 1), 18);
      return () => window.clearTimeout(t);
    }
    if (lineIndex < typedLines.length - 1) {
      const t = window.setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, 420);
      return () => window.clearTimeout(t);
    }
    setDone(true);
  }, [charIndex, lineIndex, typedLines, done, linesKey]);

  const speaking = !done;
  const visibleLines = typedLines.slice(0, lineIndex + 1);
  const currentLine = typedLines[lineIndex];
  const typedCurrent = currentLine?.text.slice(0, charIndex) || "";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-sky-500/20 bg-zinc-950/50 shadow-[0_12px_40px_rgba(14,165,233,0.08)] backdrop-blur-2xl ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.05),transparent_55%)]" />

      <div className="relative flex gap-3.5 p-3.5 sm:gap-4 sm:p-4">
        <AwhinaAvatar speaking={speaking} />

        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">
              {AWHINA_NAME} · online
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400/90">
                Live
              </span>
            </span>
          </div>

          <div className="rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2.5">
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
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-sky-400 align-middle" />
                  )}
                </p>
              )}
            </div>
          </div>

          {insight && done && (
            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {showCategory && (
                <p className="mb-1 text-[10px] font-medium text-zinc-500">
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
