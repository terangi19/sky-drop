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
