/**
 * Purchase state machine — centralized transition rules.
 *
 * Every purchase status transition in the codebase MUST go through this module.
 * Direct Firestore writes to purchase.status bypassing this module are a bug.
 */

export type PurchaseStatus =
  | "pending"
  | "seller_confirming"
  | "preparing"
  | "ready_for_pickup"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "refunded";

const TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  pending:            ["seller_confirming", "shipped", "cancelled"],
  seller_confirming:  ["preparing", "ready_for_pickup", "shipped", "delivered", "cancelled"],
  preparing:          ["ready_for_pickup", "shipped", "delivered", "cancelled"],
  ready_for_pickup:   ["delivered", "cancelled"],
  shipped:            ["delivered"],
  delivered:          ["completed"],
  completed:          [],
  cancelled:          [],
  refunded:           [],
};

/** Valid next states for a given current status */
export function allowedTransitions(status: PurchaseStatus): PurchaseStatus[] {
  return TRANSITIONS[status] || [];
}

/** Check if a transition is allowed */
export function canTransition(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/** Transition — throws if invalid */
export function transition(from: PurchaseStatus, to: PurchaseStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid purchase status transition: "${from}" → "${to}". ` +
      `Allowed: [${allowedTransitions(from).join(", ")}]`
    );
  }
}

/** Human-readable labels for UI display */
export const STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending:            "Pending",
  seller_confirming:  "Confirmed",
  preparing:          "Preparing",
  ready_for_pickup:   "Ready for Pickup",
  shipped:            "Shipped",
  delivered:          "Delivered",
  completed:          "Completed",
  cancelled:          "Cancelled",
  refunded:           "Refunded",
};

/** Colour scheme tokens for UI badges */
export const STATUS_STYLES: Record<PurchaseStatus, string> = {
  pending:            "bg-amber-500/10 text-amber-400 border-amber-500/20",
  seller_confirming:  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  preparing:          "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ready_for_pickup:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  shipped:            "bg-sky-500/10 text-sky-400 border-sky-500/20",
  delivered:          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed:          "bg-green-500/10 text-green-400 border-green-500/20",
  cancelled:          "bg-red-500/10 text-red-400 border-red-500/20",
  refunded:           "bg-violet-500/10 text-violet-300 border-violet-500/25",
};
