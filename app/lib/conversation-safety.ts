/** Why users should keep marketplace deals in Sky Drop Messages. */

export const STAY_ON_SKY_DROP_HEADLINE = "Keep this conversation on Sky Drop";

export function isStripeCheckoutPurchase(paymentType?: string | null): boolean {
  return paymentType !== "contact";
}

export function stayOnSkyDropReasons(paymentType?: string | null): string[] {
  if (paymentType === "contact") {
    return [
      "Your agreed price, pickup or shipping, and payment timing stay on record here.",
      "If you report a problem, admins can review this chat — not SMS, WhatsApp, or email.",
      "Scammers often move you off-platform so there is no proof of what was promised.",
      "Arrange Purchase payments happen outside Sky Drop, but Messages are still your paper trail.",
    ];
  }
  return [
    "Stripe Checkout disputes are reviewed using your Sky Drop message history.",
    "Open a dispute from Purchases within 7 days of delivery — include what was agreed in chat.",
    "We cannot see texts or other apps; only Messages here count as evidence.",
    "Moving off-platform weakens buyer protection and makes refunds harder to assess.",
  ];
}

/** Appended to Arrange Purchase system messages in chat. */
export function arrangePurchaseChatFooter(): string {
  return `Use this chat to arrange:
• Payment
• Shipping or pickup
• Timing

🔒 ${STAY_ON_SKY_DROP_HEADLINE}
• Admins review this thread if you report an issue
• Agree price and delivery here before paying
• Do not move to SMS or social — we cannot help with chats we cannot see`;
}

export function arrangePurchaseBuyerReminder(): string {
  return `${STAY_ON_SKY_DROP_HEADLINE} — so there is a record of what you and the seller agreed. For Stripe Checkout purchases, disputes use Messages as evidence (Purchases → Open dispute, within 7 days).`;
}
