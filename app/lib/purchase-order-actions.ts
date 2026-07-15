/**
 * Role-specific purchase order actions — single source of truth for Sales & Purchases UI.
 *
 * Seller flow: Confirmed → Preparing → Ready for Pickup / Shipped → (wait for buyer)
 * Buyer flow:  Confirm Receipt → delivered (funds release path)
 */
import { normalizePurchaseStatus } from "./purchase-status";

export type PurchaseOrderSlice = {
  status?: string;
  deliveryMethod?: string;
  disputeStatus?: string;
  paymentType?: string;
  /** Listing offered local pickup (copied onto purchase when known). */
  pickupAvailable?: boolean;
  /** Listing offered shipping (copied onto purchase when known). */
  shippingAvailable?: boolean;
};

export type OrderAction = {
  label: string;
  status: string;
  role: "seller" | "buyer";
  needsTracking?: boolean;
};

function isFulfillmentBlocked(p: PurchaseOrderSlice): boolean {
  const status = normalizePurchaseStatus(p.status);
  if (status === "refunded" || status === "cancelled") return true;
  const dispute = String(p.disputeStatus || "");
  if (["open", "pending", "under_review"].includes(dispute)) return true;
  return false;
}

function deliveryMethod(p: PurchaseOrderSlice): string {
  return String(p.deliveryMethod || "").toLowerCase();
}

/** Infer how buyer will receive the item from listing fulfillment flags. */
export function resolveDeliveryMethodFromListing(
  listing: {
    pickupAvailable?: boolean;
    shippingAvailable?: boolean;
    type?: string;
  },
  preferred?: string | null
): string {
  const pref = String(preferred || "").toLowerCase();
  if (["shipping", "pickup", "digital", "badge", "service", "rental", "either"].includes(pref)) {
    return pref;
  }
  const type = String(listing.type || "").toLowerCase();
  if (type === "digital") return "digital";
  if (type === "service") return "service";
  if (type === "rental") return "rental";

  const hasPickup = listing.pickupAvailable === true;
  const hasShipping = listing.shippingAvailable === true;

  if (hasShipping && hasPickup) return "either";
  if (hasShipping) return "shipping";
  if (hasPickup) return "pickup";
  // Legacy listings with neither flag → assume pickup
  return "pickup";
}

/** When seller is preparing, they may have one or two fulfillment choices. */
export function sellerOffersBothFulfillmentPaths(p: PurchaseOrderSlice): boolean {
  const method = deliveryMethod(p);
  if (method === "either" || method === "arrange" || method === "undecided") return true;
  if (p.pickupAvailable === true && p.shippingAvailable === true) return true;
  // Arrange Purchase historically forced deliveryMethod:"pickup" even when shipping was offered.
  // If shipping wasn't explicitly disabled, allow the seller to mark shipped too.
  if (p.paymentType === "contact" && method === "pickup" && p.shippingAvailable !== false) {
    return true;
  }
  return false;
}

function pickupAction(): OrderAction {
  return {
    label: "Mark Ready for Pickup",
    status: "ready_for_pickup",
    role: "seller",
  };
}

function shipAction(): OrderAction {
  return {
    label: "Mark Shipped",
    status: "shipped",
    role: "seller",
    needsTracking: true,
  };
}

/** All preparing-stage actions (1 or 2 buttons). */
export function getSellerPreparingActions(p: PurchaseOrderSlice): OrderAction[] {
  if (isFulfillmentBlocked(p)) return [];
  if (normalizePurchaseStatus(p.status) !== "preparing") return [];

  const method = deliveryMethod(p);

  if (sellerOffersBothFulfillmentPaths(p)) {
    return [pickupAction(), shipAction()];
  }
  if (method === "shipping" || method === "badge") {
    return [shipAction()];
  }
  return [pickupAction()];
}

/** Next action a seller may take, or null when waiting on the buyer / terminal. */
export function getSellerNextAction(p: PurchaseOrderSlice): OrderAction | null {
  if (isFulfillmentBlocked(p)) return null;

  const status = normalizePurchaseStatus(p.status);
  const method = deliveryMethod(p);

  if (status === "pending") {
    return { label: "Confirm Order", status: "seller_confirming", role: "seller" };
  }
  if (status === "seller_confirming") {
    return { label: "Mark Preparing", status: "preparing", role: "seller" };
  }
  if (status === "preparing") {
    const actions = getSellerPreparingActions(p);
    // Single choice → one button; both → Sales page uses getSellerPreparingActions
    return actions.length === 1 ? actions[0] : null;
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

/** Seller CTAs for a sale row (supports dual fulfillment when both pickup + shipping). */
export function getSellerOrderActions(p: PurchaseOrderSlice): OrderAction[] {
  if (isFulfillmentBlocked(p)) return [];
  const status = normalizePurchaseStatus(p.status);
  if (status === "preparing") return getSellerPreparingActions(p);
  const next = getSellerNextAction(p);
  return next ? [next] : [];
}

export function isSellerWaitingForBuyer(p: PurchaseOrderSlice): boolean {
  if (isFulfillmentBlocked(p)) return false;
  const status = normalizePurchaseStatus(p.status);
  return status === "ready_for_pickup" || status === "shipped";
}

export function getSellerWaitingMessage(p: PurchaseOrderSlice): string {
  const status = normalizePurchaseStatus(p.status);
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
  if (isFulfillmentBlocked(p)) return null;

  const status = normalizePurchaseStatus(p.status);
  const method = deliveryMethod(p);

  if (status === "ready_for_pickup" || status === "shipped") {
    return {
      label: "Confirm Receipt",
      status: "delivered",
      role: "buyer",
      color: "bg-emerald-500",
    };
  }

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
