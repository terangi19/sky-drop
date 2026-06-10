"use client";

import { getServicePricingBadge } from "../lib/service-pricing";

type Props = {
  listing: {
    price?: string | number | null;
    servicePricingType?: string | null;
  };
  size?: "sm" | "md";
};

const TONE_CLASS = {
  emerald: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  sky: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  violet: "border-sky-500/25 bg-sky-500/10 text-sky-300",
};

export default function ServicePricingBadge({ listing, size = "md" }: Props) {
  const badge = getServicePricingBadge(listing);
  const text = size === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold ${text} ${TONE_CLASS[badge.tone]}`}
    >
      <span>{badge.emoji}</span>
      <span>
        {badge.label}
        {badge.detail}
      </span>
    </span>
  );
}
