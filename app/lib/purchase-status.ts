/**
 * Normalize legacy / alias purchase statuses to FSM canonical values.
 */
export function normalizePurchaseStatus(status?: string | null): string {
  const s = String(status || "pending").toLowerCase();
  if (s === "confirmed" || s === "paid") return "seller_confirming";
  return s;
}

export function purchaseStatusLabel(status?: string | null): string {
  const key = normalizePurchaseStatus(status);
  const labels: Record<string, string> = {
    arrange_requested: "Purchase request",
    pending: "Pending",
    seller_confirming: "Confirmed",
    preparing: "Preparing",
    ready_for_pickup: "Ready for Pickup",
    shipped: "Shipped",
    in_progress: "In Progress",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Fully refunded",
    rented: "Rented",
    returned: "Returned",
  };
  return labels[key] || key;
}
