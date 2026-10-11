"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SALE_UNDONE_DISPUTE_STATUSES = exports.SALE_COUNT_STATUSES = void 0;
exports.normalizeSaleStatus = normalizeSaleStatus;
exports.purchaseCountsAsSale = purchaseCountsAsSale;
exports.wasCounted = wasCounted;
exports.decideSalesCountChange = decideSalesCountChange;
exports.nextSalesCount = nextSalesCount;
/** Statuses (after normalisation) that are a real sale: paid or confirmed and not undone. */
exports.SALE_COUNT_STATUSES = new Set([
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
exports.SALE_UNDONE_DISPUTE_STATUSES = new Set(["refunded", "dispute_lost", "lost"]);
/** Same normalisation as app/lib/purchase-status.ts (paid/confirmed -> seller_confirming). */
function normalizeSaleStatus(status) {
    const s = String(status !== null && status !== void 0 ? status : "").trim().toLowerCase();
    if (s === "confirmed" || s === "paid")
        return "seller_confirming";
    return s;
}
/**
 * True when the purchase counts towards the seller's salesCount.
 * Not counted: arrange_requested (not confirmed yet), awaiting_payment / offer_accepted (not paid),
 * cancelled, failed, payment_failed, refunded, unpaid, expired, and any purchase whose dispute
 * ended with the buyer getting the money back. Partial refunds keep the sale (status stays).
 */
function purchaseCountsAsSale(p) {
    var _a;
    if (!p)
        return false;
    if (!exports.SALE_COUNT_STATUSES.has(normalizeSaleStatus(p.status)))
        return false;
    const dispute = String((_a = p.disputeStatus) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
    if (exports.SALE_UNDONE_DISPUTE_STATUSES.has(dispute))
        return false;
    return true;
}
/**
 * Was this purchase already counted?
 * - Ledger present: trust it.
 * - No ledger (purchase written before this trigger was deployed): the legacy inline writers
 *   (createPurchaseWithAdmin on first create, confirm-arrange-sale on confirm) counted a purchase
 *   when it entered a sale state, so assume counted == "the state BEFORE this write was a sale".
 *   A brand-new doc (no before) was never counted.
 */
function wasCounted(ledger, before) {
    if (ledger && typeof ledger.counted === "boolean")
        return ledger.counted;
    return purchaseCountsAsSale(before);
}
function decideSalesCountChange(counted, shouldCount) {
    if (shouldCount && !counted)
        return { kind: "increment" };
    if (!shouldCount && counted)
        return { kind: "decrement" };
    return { kind: "none", counted };
}
/** New salesCount after a decision; never below 0, junk treated as 0. */
function nextSalesCount(current, decision) {
    const n = typeof current === "number" && Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
    if (decision.kind === "increment")
        return n + 1;
    if (decision.kind === "decrement")
        return Math.max(0, n - 1);
    return n;
}
//# sourceMappingURL=sales-count.js.map