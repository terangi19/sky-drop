import { parseFirestoreDate } from "./date-format";

export type RefundViewerRole = "buyer" | "seller";

export const REFUND_BADGE_CLASS =
  "bg-violet-500/10 text-violet-300 border-violet-500/25";

export const REFUND_CARD_CLASS =
  "rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent";

export function isRefundedStatus(status?: string | null): boolean {
  return String(status || "").toLowerCase() === "refunded";
}

export function resolveRefundAmount(
  refundAmount?: number | null,
  total?: number | null
): number | null {
  const refund = Number(refundAmount);
  if (Number.isFinite(refund) && refund > 0) return refund;
  const orderTotal = Number(total);
  if (Number.isFinite(orderTotal) && orderTotal > 0) return orderTotal;
  return null;
}

export function formatRefundAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toFixed(2)}`;
}

export function formatRefundDate(value: unknown): string | null {
  const date = parseFirestoreDate(value);
  if (!date) return null;
  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getRefundHeadline(_role: RefundViewerRole): string {
  return "This order has been fully refunded.";
}

export function getRefundSubtext(role: RefundViewerRole): string {
  if (role === "seller") {
    return "The buyer's payment was returned. This sale is closed and no further action is needed.";
  }
  return "The payment was returned to your original payment method via Stripe.";
}

export type RefundDisplayFields = {
  status?: string | null;
  refundAmount?: number | null;
  refundedAt?: unknown;
  total?: number | null;
};

export function getRefundDisplay(fields: RefundDisplayFields) {
  const amount = resolveRefundAmount(fields.refundAmount, fields.total);
  const refundedOn = formatRefundDate(fields.refundedAt);

  return {
    amount,
    amountLabel: formatRefundAmount(amount),
    refundedOn,
    refundedOnLabel: refundedOn ?? "Date unavailable",
  };
}

/**
 * Refund amount carried by a refund order message in a thread. The Stripe webhook
 * (lib/stripe-refund-sync.ts) writes `refundAmount` on new messages and always writes the text
 * `Payment refunded for "<title>" — $151.00.`, so older messages are parsed from the text.
 */
export function refundAmountFromOrderMessage(
  msg: { refundAmount?: unknown; text?: unknown } | null | undefined
): number | null {
  if (!msg) return null;
  const direct = Number(msg.refundAmount);
  if (typeof msg.refundAmount !== "undefined" && msg.refundAmount !== null && Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const text = typeof msg.text === "string" ? msg.text : "";
  const m = /(?:Payment refunded|Partial refund issued).*\$\s*([\d,]+(?:\.\d{1,2})?)\.?\s*$/.exec(text.trim());
  if (!m) return null;
  const parsed = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Amount for the in-thread refund card. Precedence: purchase.refundAmount (authoritative, from
 * Stripe) → the refund message's own amount → purchase.total. Never the listing price: it excludes
 * the $1.00 processing fee and shipping that Stripe refunds, which is how the card showed $150.00
 * next to a "Payment refunded … — $151.00" preview.
 */
export function threadRefundCardAmount(
  purchase: { refundAmount?: unknown; total?: unknown } | null | undefined,
  msg: { refundAmount?: unknown; text?: unknown } | null | undefined
): { refundAmount: number | null; total: number | null } {
  const fromPurchase = Number(purchase?.refundAmount);
  if (Number.isFinite(fromPurchase) && fromPurchase > 0) return { refundAmount: fromPurchase, total: null };
  const fromMsg = refundAmountFromOrderMessage(msg);
  if (fromMsg != null) return { refundAmount: fromMsg, total: null };
  const total = Number(purchase?.total);
  return { refundAmount: null, total: Number.isFinite(total) && total > 0 ? total : null };
}
