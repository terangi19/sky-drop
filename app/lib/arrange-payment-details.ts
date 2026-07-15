/** Bank transfer details for Arrange Purchase (off-platform payment). */

export const ARRANGE_KYC_SUPPORT_EMAIL = "support@skydrop.co.nz";

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
      `Purchase request: "${listingTitle}"`,
      `Price: ${priceLabel}`,
      "",
      "Agree how to pay in this chat (bank transfer, cash, or pickup).",
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
    "Only pay after you agree pickup or shipping in this chat.",
    "",
    arrangePurchaseBuyerReminder()
  );

  return lines.join("\n");
}

export function buildArrangePurchaseSellerMessage(
  buyerHandle: string,
  listingTitle: string,
  _sellerHasPaymentDetails = false
): string {
  const handle =
    buyerHandle === "Buyer" || buyerHandle === "User"
      ? "A buyer"
      : buyerHandle.startsWith("@")
        ? buyerHandle
        : `@${buyerHandle}`;

  return `${handle} wants to purchase "${listingTitle}"

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
