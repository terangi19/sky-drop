"use client";

import Link from "next/link";
import type { AwhinaInsight, AwhinaInsightAction } from "../lib/awhina-insights";

type Props = {
  insight: AwhinaInsight | null;
  className?: string;
};

function InsightAction({ action }: { action: AwhinaInsightAction }) {
  const className = action.primary
    ? "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 px-3 py-1.5 text-xs font-bold text-white shadow-[0_0_16px_rgba(56,189,248,0.25)] transition hover:brightness-110 active:scale-[0.98]"
    : "inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-sky-500/30 hover:bg-white/[0.07] hover:text-white active:scale-[0.98]";

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

export default function AwhinaInsightCard({ insight, className = "mb-6 sm:mb-8" }: Props) {
  if (!insight) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-sky-500/20 bg-zinc-950/60 px-4 py-3 shadow-[0_8px_32px_rgba(14,165,233,0.06)] backdrop-blur-xl ${className}`}
      role="status"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.14),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.06),transparent_50%)]" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-sky-300/90">
            <span className="mr-1">{insight.icon}</span>
            {insight.label}
          </p>
          <p className="mt-1 text-sm leading-snug text-zinc-100">{insight.message}</p>
        </div>
        {insight.actions && insight.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {insight.actions.map((action) => (
              <InsightAction key={action.label} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
