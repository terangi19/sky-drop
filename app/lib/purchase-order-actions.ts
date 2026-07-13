/**
 * Role-specific purchase order actions — single source of truth for Sales & Purchases UI.
 *
 * Seller flow: Confirmed → Preparing → Ready for Pickup / Shipped → (wait for buyer)
 * Buyer flow:  Confirm Receipt → delivered (funds release path)
 */

export type PurchaseOrderSlice = {
  status?: string;
  deliveryMethod?: string;
  disputeStatus?: string;
  fundsReleased?: boolean;
  paymentType?: string;
};

export type OrderAction = {
  label: string;
  status: string;
  role: "seller" | "buyer";
  needsTracking?: boolean;
};

function isBlocked(p: PurchaseOrderSlice): boolean {
  const status = String(p.status || "").toLowerCase();
  if (status === "refunded" || status === "cancelled") return true;
  const dispute = String(p.disputeStatus || "");
  if (["open", "pending", "under_review"].includes(dispute)) return true;
  if (p.fundsReleased) return true;
  return false;
}

function deliveryMethod(p: PurchaseOrderSlice): string {
  return String(p.deliveryMethod || "").toLowerCase();
}

/** Next action a seller may take, or null when waiting on the buyer / terminal. */
export function getSellerNextAction(p: PurchaseOrderSlice): OrderAction | null {
  if (isBlocked(p)) return null;

  const status = String(p.status || "").toLowerCase();
  const method = deliveryMethod(p);

  if (status === "pending") {
    return { label: "Confirm Order", status: "seller_confirming", role: "seller" };
  }
  if (status === "seller_confirming") {
    return { label: "Mark Preparing", status: "preparing", role: "seller" };
  }
  if (status === "preparing") {
    if (method === "shipping" || method === "badge") {
      return {
        label: "Mark Shipped",
        status: "shipped",
        role: "seller",
        needsTracking: true,
      };
    }
    return {
      label: "Mark Ready for Pickup",
      status: "ready_for_pickup",
      role: "seller",
    };
  }
  if (status === "in_progress" && method === "service") {
    return { label: "Mark Service Complete", status: "completed", role: "seller" };
  }
  if (status === "rented" && method === "rental") {
    return { label: "Mark Returned", status: "returned", role: "seller" };
  }
  if (status === "returned" && method === "rental") {
    return { label: "Complete Rental", status: "completed", role: "seller" };
  }

  return null;
}

export function isSellerWaitingForBuyer(p: PurchaseOrderSlice): boolean {
  if (isBlocked(p)) return false;
  const status = String(p.status || "").toLowerCase();
  return status === "ready_for_pickup" || status === "shipped";
}

export function getSellerWaitingMessage(p: PurchaseOrderSlice): string {
  const status = String(p.status || "").toLowerCase();
  if (status === "ready_for_pickup") {
    return "Waiting for buyer to confirm pickup";
  }
  if (status === "shipped") {
    return "Waiting for buyer to confirm receipt";
  }
  return "Waiting for buyer";
}

/** Next action a buyer may take, or null. */
export function getBuyerNextAction(
  p: PurchaseOrderSlice
): (OrderAction & { color?: string }) | null {
  if (isBlocked(p)) return null;

  const status = String(p.status || "").toLowerCase();
  const method = deliveryMethod(p);

  if (status === "ready_for_pickup" || status === "shipped") {
    return {
      label: "Confirm Receipt",
      status: "delivered",
      role: "buyer",
      color: "bg-emerald-500",
    };
  }

  // Legacy: buyer could confirm pickup before seller marked ready
  if (method === "pickup" && status === "seller_confirming") {
    return {
      label: "Confirm Receipt",
      status: "delivered",
      role: "buyer",
      color: "bg-emerald-500",
    };
  }

  if (method === "service" && status === "completed") {
    return {
      label: "Confirm Receipt",
      status: "delivered",
      role: "buyer",
      color: "bg-emerald-500",
    };
  }

  if (method === "rental" && status === "rented") {
    return {
      label: "Mark Returned",
      status: "returned",
      role: "buyer",
      color: "bg-sky-500",
    };
  }

  return null;
}
