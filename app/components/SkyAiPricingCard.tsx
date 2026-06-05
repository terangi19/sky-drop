"use client";

import Link from "next/link";
import { dispatchListingFill } from "../lib/sky-ai-listing-fill";
import { showToast } from "./Toast";
import type { MarketDataQuality, SkyAiPricingInsight } from "../lib/sky-ai-comps";

type Props = {
  insight: SkyAiPricingInsight;
};

const QUALITY_STYLES: Record<
  MarketDataQuality,
  { label: string; text: string; bg: string; border: string }
> = {
  poor: {
    label: "Poor",
    text: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
  },
  limited: {
    label: "Limited",
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
  },
  moderate: {
    label: "Moderate",
    text: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
  },
  strong: {
    label: "Strong",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
  },
};

function formatBand(band: { low: number; high: number }): string {
  if (band.low <= 0 && band.high <= 0) return "—";
  if (band.low === band.high) return `$${band.low.toLocaleString()}`;
  return `$${band.low.toLocaleString()}–$${band.high.toLocaleString()}`;
}

function applyPrice(amount: number, tier: string) {
  dispatchListingFill({ price: String(amount) });
  showToast(`Applied ${tier} price $${amount.toLocaleString()} to your listing`);
}

function roundPrice(n: number) {
  if (n >= 1000) return Math.round(n / 10) * 10;
  if (n >= 100) return Math.round(n / 5) * 5;
  return Math.round(n);
}

export default function SkyAiPricingCard({ insight }: Props) {
  if (insight.compsUsed === 0) return null;

  const quality = QUALITY_STYLES[insight.marketDataQuality];
  const marketLabel = insight.fairMarketLabel;

  const tiers = [
    {
      key: "quickSale" as const,
      label: "Quick Sale",
      hint: insight.useMarketReference
        ? "10–20% below reference"
        : "10–20% below fair market",
      band: insight.quickSale,
      accent: "text-emerald-400",
      border: "border-emerald-500/25 hover:border-emerald-500/45",
    },
    {
      key: "fairMarket" as const,
      label: marketLabel,
      hint: insight.useMarketReference
        ? "Reference ±10% uncertainty band"
        : "Filtered comp median",
      band: insight.fairMarket,
      accent: "text-sky-400",
      border: "border-sky-500/30 hover:border-sky-500/50",
      recommended: insight.recommendedTier === "fairMarket",
    },
    {
      key: "maxRealistic" as const,
      label: "Max Realistic",
      hint: insight.useMarketReference
        ? "Reference +10–25%"
        : "Top of filtered range",
      band: insight.maxRealistic,
      accent: "text-violet-400",
      border: "border-violet-500/25 hover:border-violet-500/45",
    },
  ];

  const applyAmount = (band: { low: number; high: number }) =>
    roundPrice((band.low + band.high) / 2);

  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-transparent">
      <div className="border-b border-sky-500/15 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold text-sky-300">NZD Pricing Intelligence</p>
          <div
            className={`shrink-0 rounded-md border px-2 py-0.5 ${quality.bg} ${quality.border}`}
          >
            <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">
              Data Quality
            </p>
            <p className={`text-[10px] font-black ${quality.text}`}>{quality.label}</p>
          </div>
        </div>

        {insight.useMarketReference && insight.marketReference && (
          <p className="mt-1.5 text-sm font-black text-white">
            Estimated Market Reference:{" "}
            <span className="text-sky-300">~${insight.marketReference.toLocaleString()}</span>
          </p>
        )}

        <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md bg-black/25 px-1.5 py-1">
            <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Used</p>
            <p className="text-xs font-black text-white">{insight.compsUsed}</p>
          </div>
          <div className="rounded-md bg-black/25 px-1.5 py-1">
            <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Outliers</p>
            <p className="text-xs font-black text-amber-400/90">{insight.outliersIgnored}</p>
          </div>
          <div className="rounded-md bg-black/25 px-1.5 py-1">
            <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Confidence</p>
            <p className="text-xs font-black text-sky-300">{insight.confidence}%</p>
          </div>
        </div>

        {insight.limitedDataNotice && (
          <p className="mt-1.5 text-[10px] font-medium text-amber-400/90">
            {insight.limitedDataNotice}
          </p>
        )}
        {insight.manualJudgementWarning && (
          <p className="mt-1 text-[10px] font-medium text-zinc-400">
            {insight.manualJudgementWarning}
          </p>
        )}

        <p className="mt-1.5 text-[10px] leading-snug text-zinc-400">
          <span className="font-semibold text-zinc-300">Reason: </span>
          {insight.confidenceReason}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-zinc-500">{insight.reasoning}</p>
      </div>

      <div className="space-y-1.5 p-2">
        {tiers.map((tier) => (
          <div
            key={tier.key}
            className={`flex items-center justify-between gap-2 rounded-lg border bg-black/20 px-2.5 py-2 ${tier.border}`}
          >
            <div className="min-w-0">
              <p className={`text-[11px] font-bold ${tier.accent}`}>
                {tier.label}
                {tier.recommended && (
                  <span className="ml-1.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[8px] font-bold text-sky-300">
                    REC
                  </span>
                )}
              </p>
              <p className="text-[10px] text-zinc-500">{tier.hint}</p>
              <p className="mt-0.5 text-sm font-black text-white">{formatBand(tier.band)}</p>
            </div>
            <button
              type="button"
              onClick={() => applyPrice(applyAmount(tier.band), tier.label)}
              className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-sky-500/20"
            >
              Apply
            </button>
          </div>
        ))}
      </div>

      {insight.comps.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 py-2">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
            Comps used in estimate
          </p>
          <div className="space-y-1">
            {insight.comps.map((c) => (
              <Link
                key={c.id}
                href={`/post/listing/${c.id}`}
                className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <span className="truncate">
                  {c.matchTier === "exact" && (
                    <span className="mr-1 text-[8px] font-bold text-emerald-500/90">EXACT</span>
                  )}
                  {c.matchTier === "make" && (
                    <span className="mr-1 text-[8px] font-bold text-amber-500/90">MAKE</span>
                  )}
                  {c.sourceKind === "sold" && (
                    <span className="mr-1 text-[8px] font-bold text-violet-400/90">SOLD</span>
                  )}
                  {c.title}
                </span>
                <span className="shrink-0 font-bold text-zinc-300">
                  ${c.price.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {insight.ignoredComps.length > 0 && (
        <div className="border-t border-amber-500/10 bg-amber-500/[0.03] px-3 py-2">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-500/70">
            Outliers ignored
          </p>
          <div className="space-y-1">
            {insight.ignoredComps.map((c) => (
              <div
                key={`ignored-${c.id}`}
                className="flex items-center justify-between gap-2 px-1 py-0.5 text-[10px] text-zinc-500 line-through decoration-amber-500/40"
              >
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 font-bold">${c.price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
