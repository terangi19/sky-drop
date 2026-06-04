/** Bank transfer details for Arrange Purchase (off-platform payment). */

import {
  arrangePurchaseBuyerReminder,
  arrangePurchaseChatFooter,
} from "./conversation-safety";

export type ArrangePaymentDetails = {
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankReference?: string;
};

export function pickArrangePaymentDetails(
  profile: Record<string, unknown> | null | undefined
): ArrangePaymentDetails {
  return {
    bankAccountName: String(profile?.bankAccountName || "").trim(),
    bankAccountNumber: String(profile?.bankAccountNumber || "").trim(),
    bankReference: String(profile?.bankReference || "").trim(),
  };
}

export function hasArrangePaymentDetails(details: ArrangePaymentDetails): boolean {
  return !!(details.bankAccountName && details.bankAccountNumber);
}

/** Shown to buyer (and seller) with copy-friendly lines. */
export function buildArrangePaymentDetailsMessage(
  listingTitle: string,
  price: string,
  details: ArrangePaymentDetails
): string {
  const priceLabel = price ? `$${price}` : "as agreed";

  if (!hasArrangePaymentDetails(details)) {
    return [
      "💳 Payment details",
      "",
      `Listing: "${listingTitle}"`,
      `Price: ${priceLabel}`,
      "",
      "The seller has not added bank transfer info on their profile yet.",
      "Ask them to add it under Profile → Payment settings,",
      "or agree payment method here in chat (cash, bank transfer, etc.).",
      "",
      "Sky Drop does not process Arrange Purchase payments.",
      "",
      arrangePurchaseBuyerReminder(),
    ].join("\n");
  }

  const lines = [
    "💳 Pay the seller",
    "",
    `Listing: "${listingTitle}"`,
    `Price: ${priceLabel}`,
    "",
    `Bank: ${details.bankAccountName}`,
    `Account: ${details.bankAccountNumber}`,
  ];

  if (details.bankReference) {
    lines.push(`Reference: ${details.bankReference}`);
  }

  lines.push(
    "",
    "Copy the lines above into your banking app. Only pay after you and the seller agree pickup or shipping in chat.",
    "",
    "Sky Drop does not handle this payment — you pay the seller directly.",
    "",
    arrangePurchaseBuyerReminder()
  );

  return lines.join("\n");
}

export function buildArrangePurchaseSellerMessage(
  buyerHandle: string,
  listingTitle: string,
  sellerHasPaymentDetails: boolean
): string {
  const handle =
    buyerHandle === "Buyer" || buyerHandle === "User"
      ? "A buyer"
      : buyerHandle.startsWith("@")
        ? buyerHandle
        : `@${buyerHandle}`;

  const paymentTip = sellerHasPaymentDetails
    ? "Your bank details from Profile were sent to the buyer in chat."
    : "Add bank account details in Profile → Payment settings so buyers see how to pay you automatically.";

  return `${handle} wants to purchase "${listingTitle}"

${paymentTip}

${arrangePurchaseChatFooter()}`;
}

export function buildArrangePurchaseBuyerMessage(listingTitle: string): string {
  return `🤝 You've requested to purchase "${listingTitle}"

${arrangePurchaseChatFooter()}`;
}

/** Lines buyers can copy from chat (Bank:, Account:, etc.). */
export function parseCopyablePaymentLines(text: string): Array<{ label: string; value: string }> {
  if (!text.includes("💳 Pay the seller") && !text.includes("💳 Payment details")) {
    return [];
  }
  const out: Array<{ label: string; value: string }> = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(Bank|Account|Reference):\s*(.+)$/i);
    if (m) out.push({ label: m[1], value: m[2].trim() });
  }
  return out;
}
