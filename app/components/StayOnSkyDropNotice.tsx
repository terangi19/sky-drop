"use client";

import {
  STAY_ON_SKY_DROP_HEADLINE,
  stayOnSkyDropReasons,
} from "../lib/conversation-safety";

type Props = {
  paymentType?: string | null;
  /** Tighter layout above the message input */
  compact?: boolean;
};

export default function StayOnSkyDropNotice({ paymentType, compact }: Props) {
  const reasons = stayOnSkyDropReasons(paymentType);
  const stripe = paymentType !== "contact";

  if (compact) {
    return (
      <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2">
        <p className="text-[10px] font-bold text-sky-400">{STAY_ON_SKY_DROP_HEADLINE}</p>
        <p className="mt-0.5 text-[9px] leading-relaxed text-zinc-500">
          {stripe
            ? "Disputes use this chat as evidence — keep payment and delivery agreements here."
            : "Keep agreements here so we can review reports; Arrange payments are still between you and the seller."}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] px-3.5 py-3">
      <p className="text-[11px] font-bold text-sky-400">{STAY_ON_SKY_DROP_HEADLINE}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        {stripe
          ? "For Stripe Checkout sales, Sky Drop can help with disputes when there is a clear record in Messages."
          : "For Arrange Purchase, payment is direct to the seller — but staying in chat still protects both sides if something goes wrong."}
      </p>
      <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-zinc-400 list-disc pl-4">
        {reasons.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
