/**
 * profiles/{uid}.salesCount integrity (SALES-COUNT-INTEGRITY).
 *
 * Pure helpers, dependency-free so vitest and the one-off recount use the same rules. The writer is
 * the `onPurchaseWrittenSalesCount` trigger (sales-count-trigger.ts): every write to a purchase
 * (API, webhook, admin, cron, console or client) re-derives "should this purchase count?" from the
 * purchase's CURRENT state and reconciles it against a server-only ledger doc
 * `salesCountLedger/{purchaseId}` (firestore.rules default-deny => clients can't flip it).
 * Idempotent: re-running for the same state is a no-op, so Stripe webhook retries / trigger
 * redelivery can't double-count or double-decrement, and the count never goes below 0.
 */

/** Statuses (after normalisation) that are a real sale: paid or confirmed and not undone. */
export const SALE_COUNT_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "seller_confirming",
  "preparing",
  "ready_for_pickup",
  "shipped",
  "delivered",
  "completed",
  "in_progress",
  "rented",
  "returned",
]);

/** disputeStatus values meaning the money went back to the buyer. */
export const SALE_UNDONE_DISPUTE_STATUSES: ReadonlySet<string> = new Set(["refunded", "dispute_lost", "lost"]);

export type PurchaseSaleFields = {
  status?: unknown;
  disputeStatus?: unknown;
  sellerEmail?: unknown;
};

/** Same normalisation as app/lib/purchase-status.ts (paid/confirmed -> seller_confirming). */
export function normalizeSaleStatus(status: unknown): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "confirmed" || s === "paid") return "seller_confirming";
  return s;
}

/**
 * True when the purchase counts towards the seller's salesCount.
 * Not counted: arrange_requested (not confirmed yet), awaiting_payment / offer_accepted (not paid),
 * cancelled, failed, payment_failed, refunded, unpaid, expired, and any purchase whose dispute
 * ended with the buyer getting the money back. Partial refunds keep the sale (status stays).
 */
export function purchaseCountsAsSale(p: PurchaseSaleFields | null | undefined): boolean {
  if (!p) return false;
  if (!SALE_COUNT_STATUSES.has(normalizeSaleStatus(p.status))) return false;
  const dispute = String(p.disputeStatus ?? "").trim().toLowerCase();
  if (SALE_UNDONE_DISPUTE_STATUSES.has(dispute)) return false;
  return true;
}

export type LedgerState = { counted: boolean; sellerProfileId?: string | null } | null | undefined;

/**
 * Was this purchase already counted?
 * - Ledger present: trust it.
 * - No ledger (purchase written before this trigger was deployed): the legacy inline writers
 *   (createPurchaseWithAdmin on first create, confirm-arrange-sale on confirm) counted a purchase
 *   when it entered a sale state, so assume counted == "the state BEFORE this write was a sale".
 *   A brand-new doc (no before) was never counted.
 */
export function wasCounted(ledger: LedgerState, before: PurchaseSaleFields | null | undefined): boolean {
  if (ledger && typeof ledger.counted === "boolean") return ledger.counted;
  return purchaseCountsAsSale(before);
}

export type SalesCountDecision =
  | { kind: "none"; counted: boolean }
  | { kind: "increment" }
  | { kind: "decrement" };

export function decideSalesCountChange(counted: boolean, shouldCount: boolean): SalesCountDecision {
  if (shouldCount && !counted) return { kind: "increment" };
  if (!shouldCount && counted) return { kind: "decrement" };
  return { kind: "none", counted };
}

/** New salesCount after a decision; never below 0, junk treated as 0. */
export function nextSalesCount(current: unknown, decision: SalesCountDecision): number {
  const n = typeof current === "number" && Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  if (decision.kind === "increment") return n + 1;
  if (decision.kind === "decrement") return Math.max(0, n - 1);
  return n;
}
