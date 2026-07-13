import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import { canTransition } from "../../lib/purchase-fsm";

const SELLER_ALLOWED_STATUSES = new Set([
  "seller_confirming",
  "preparing",
  "ready_for_pickup",
  "shipped",
  "completed",
  "in_progress",
  "returned",
]);

const BUYER_ALLOWED_STATUSES = new Set(["delivered", "returned"]);

export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`update-purchase-status:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const userEmail = decoded.email || "";
    if (!userEmail) {
      return NextResponse.json({ error: "Could not determine user email" }, { status: 400 });
    }

    const body = await req.json();
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    const status = typeof body.status === "string" ? body.status : "";
    const tracking =
      typeof body.tracking === "string" ? body.tracking.trim() : "";

    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    const isBuyerAction = BUYER_ALLOWED_STATUSES.has(status);
    const isSellerAction = SELLER_ALLOWED_STATUSES.has(status);

    if (!isBuyerAction && !isSellerAction) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = getAdminDb();
    const purchaseRef = db.collection("purchases").doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();

    if (!purchaseSnap.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    const purchase = purchaseSnap.data()!;

    if (isBuyerAction) {
      if (String(purchase.buyerEmail || "") !== userEmail) {
        return NextResponse.json({ error: "Only the buyer can confirm receipt" }, { status: 403 });
      }
    } else if (String(purchase.sellerEmail || "") !== userEmail) {
      return NextResponse.json({ error: "Only the seller can update this order" }, { status: 403 });
    }

    const disputeStatus = String(purchase.disputeStatus || "");
    const currentStatus = String(purchase.status || "");

    if (["open", "pending", "under_review"].includes(disputeStatus)) {
      return NextResponse.json(
        { error: "Order is in dispute — status cannot be changed" },
        { status: 400 }
      );
    }

    if (currentStatus === "refunded") {
      return NextResponse.json(
        { error: "Order has been refunded — status cannot be changed" },
        { status: 400 }
      );
    }

    // FSM validation — ensure the transition is allowed
    if (!canTransition(currentStatus as any, status as any)) {
      return NextResponse.json(
        { error: `Cannot transition from "${currentStatus}" to "${status}"` },
        { status: 400 }
      );
    }

    if (status === "delivered") {
      const method = String(purchase.deliveryMethod || "");
      const canConfirm =
        ["shipped", "ready_for_pickup"].includes(currentStatus) ||
        (method === "pickup" && currentStatus === "seller_confirming") ||
        (method === "service" && ["in_progress", "completed"].includes(currentStatus));
      if (!canConfirm) {
        return NextResponse.json(
          { error: "This order is not ready to confirm yet" },
          { status: 400 }
        );
      }
    }

    if (
      status === "shipped" &&
      !["seller_confirming", "pending", "preparing"].includes(currentStatus)
    ) {
      return NextResponse.json(
        { error: "Order must be confirmed before marking shipped" },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (status === "delivered") {
      patch.deliveredAt = FieldValue.serverTimestamp();
    }

    if (status === "shipped" && tracking) {
      patch.tracking = tracking;
      patch.trackingNumber = tracking;
    }

    await purchaseRef.update(patch);

    return NextResponse.json({ success: true, status, tracking: tracking || null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update order";
    console.error("[update-purchase-status]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
