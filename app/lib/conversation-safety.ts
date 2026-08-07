/** Why users should keep marketplace deals in Sky Drop Messages. */

export const STAY_ON_SKY_DROP_HEADLINE = "Keep this conversation on Sky Drop";

/** V1 messaging-first safety — no escrow, protection, or platform payment guarantees. */
export const V1_ARRANGE_SAFETY_ONE_LINER =
  "Agree on payment, pickup or delivery directly with the seller. Meet in a public place and verify the item before paying.";

export function isStripeCheckoutPurchase(paymentType?: string | null): boolean {
  return paymentType !== "contact";
}

/** Messaging-first V1 reasons. Stripe dispute copy is intentionally omitted. */
export function stayOnSkyDropReasons(_paymentType?: string | null): string[] {
  return [
    "Your agreed price, pickup or shipping, and payment timing stay on record here.",
    "If you report a problem, admins can review this chat — not SMS, WhatsApp, or email.",
    "Scammers often move you off-platform so there is no proof of what was promised.",
    V1_ARRANGE_SAFETY_ONE_LINER,
  ];
}

/** Appended to Arrange Purchase system messages in chat. */
export function arrangePurchaseChatFooter(): string {
  return `Use this chat to arrange:
• Payment
• Shipping or pickup
• Timing

🔒 ${STAY_ON_SKY_DROP_HEADLINE}
• Agree price and delivery here before paying
• ${V1_ARRANGE_SAFETY_ONE_LINER}
• Do not move to SMS or social — keep agreements on record here`;
}

export function arrangePurchaseBuyerReminder(): string {
  return `${STAY_ON_SKY_DROP_HEADLINE} — so there is a record of what you and the seller agreed. ${V1_ARRANGE_SAFETY_ONE_LINER}`;
}
