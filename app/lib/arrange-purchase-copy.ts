/** Buyer-facing copy for Arrange Purchase (paymentType: contact) listings */

export const ARRANGE_PURCHASE_LABEL = "Arrange Purchase";

/** @deprecated Use ARRANGE_PURCHASE_LABEL */
export const ARRANGE_PURCHASE_CARD_LABEL = ARRANGE_PURCHASE_LABEL;

/** @deprecated Use ARRANGE_PURCHASE_LABEL */
export const ARRANGE_PURCHASE_BTN_LABEL = ARRANGE_PURCHASE_LABEL;

export function getArrangePurchaseButtonLabel(options?: {
  price?: string | number;
  hasExistingChat?: boolean;
  loading?: boolean;
  includeEmoji?: boolean;
}): string {
  const prefix = options?.includeEmoji === false ? "" : "🤝 ";
  if (options?.loading) return "Connecting…";
  if (options?.hasExistingChat) return `${prefix}Open chat`;
  if (options?.price != null && String(options.price).trim() !== "") {
    return `${prefix}${ARRANGE_PURCHASE_LABEL} — $${options.price}`;
  }
  return `${prefix}${ARRANGE_PURCHASE_LABEL}`;
}

export const ARRANGE_PURCHASE_INFO_HINT =
  'Tap "Arrange Purchase" to open a 1-on-1 chat and agree payment with the seller.';

export const ARRANGE_PURCHASE_TOAST_HINT =
  "This listing uses Arrange Purchase — tap Arrange Purchase to message the seller.";
