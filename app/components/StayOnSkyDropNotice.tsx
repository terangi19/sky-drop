"use client";

import {
  STAY_ON_SKY_DROP_HEADLINE,
  V1_ARRANGE_SAFETY_ONE_LINER,
  stayOnSkyDropReasons,
} from "../lib/conversation-safety";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";

type Props = {
  paymentType?: string | null;
  /** Tighter layout above the message input */
  compact?: boolean;
};

export default function StayOnSkyDropNotice({ paymentType, compact }: Props) {
  const messagingFirst = !isStripeCheckoutVisibleClient();
  const reasons = messagingFirst
    ? [
        V1_ARRANGE_SAFETY_ONE_LINER,
        "Keep price and delivery agreements in this chat so you both have a record.",
        "Scammers often ask you to move to SMS or social apps — stay here when you can.",
      ]
    : stayOnSkyDropReasons(paymentType);
  const stripe = !messagingFirst && paymentType !== "contact";

  if (compact) {
    return (
      <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2">
        <p className="text-[10px] font-bold text-sky-400">
          {messagingFirst ? "Arrange safely" : STAY_ON_SKY_DROP_HEADLINE}
        </p>
        <p className="mt-0.5 text-[9px] leading-relaxed text-zinc-500">
          {messagingFirst
            ? V1_ARRANGE_SAFETY_ONE_LINER
            : stripe
              ? "Disputes use this chat as evidence — keep payment and delivery agreements here."
              : "Keep agreements here so there is a record; payment is still between you and the seller."}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] px-3.5 py-3">
      <p className="text-[11px] font-bold text-sky-400">
        {messagingFirst ? "Arrange safely" : STAY_ON_SKY_DROP_HEADLINE}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        {messagingFirst
          ? V1_ARRANGE_SAFETY_ONE_LINER
          : stripe
            ? "For Stripe Checkout sales, Sky Drop can help with disputes when there is a clear record in Messages."
            : "Payment is arranged directly with the seller — keep agreements in chat for a clear record."}
      </p>
      <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-zinc-400 list-disc pl-4">
        {reasons.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
