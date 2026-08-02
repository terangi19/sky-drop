/**
 * Completes a delivered purchase order.
 *
 * Stripe Checkout uses destination charges: funds already went to the seller at
 * payment time. This endpoint only marks the order complete — it never creates
 * Stripe transfers.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, getServerDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isAdminEmail } from "../../lib/admin-check";
import { writeAuditLog } from "../../lib/admin-utils";
import {
  isActiveDisputeStatus,
  isOrderCompleted,
  isStripeListingCheckout,
  orderCompletedPatch,
} from "../../lib/payment-order-completion";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  let decodedToken: { email?: string } | undefined;
  let purchaseId: string | undefined;

  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`complete-order:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const db = isAdminInitialized() ? getAdminDb() : getServerDb(idToken);

    const body = await req.json();
    purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    const purchaseDoc = await db.collection("purchases").doc(purchaseId).get();
    if (!purchaseDoc.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }
    const purchase = purchaseDoc.data()!;

    const isSeller = purchase.sellerEmail === decodedToken.email;
    const isBuyer = purchase.buyerEmail === decodedToken.email;
    const isAdmin = isAdminEmail(decodedToken.email || "");
    if (!isSeller && !isBuyer && !isAdmin) {
      return NextResponse.json({ error: "Not authorized for this purchase" }, { status: 403 });
    }

    if (isOrderCompleted(purchase)) {
      return NextResponse.json({
        success: true,
        message: "Order already completed",
      });
    }

    if (purchase.status !== "delivered") {
      return NextResponse.json(
        { error: "Purchase must be in 'delivered' status to complete the order" },
        { status: 400 }
      );
    }

    if (isActiveDisputeStatus(purchase.disputeStatus) && !isAdmin) {
      return NextResponse.json(
        { error: "Order is in dispute — completion is paused until the dispute is resolved" },
        { status: 400 }
      );
    }

    // Arrange Purchase: off-platform money — completion is status-only.
    // Stripe Checkout: destination charges already paid the seller at PI success.
    if (
      String(purchase.paymentType || "").toLowerCase() !== "contact" &&
      !isStripeListingCheckout(purchase) &&
      purchase.destinationCharge === false &&
      purchase.stripePaymentIntentId
    ) {
      // Legacy separate-charges purchases are no longer supported.
      return NextResponse.json(
        {
          error:
            "This order used a retired payment path. Contact support@skydrop.co.nz — Sky Drop no longer creates manual Stripe transfers.",
        },
        { status: 400 }
      );
    }

    if (!isAdmin && isSeller) {
      const deliveredAt =
        purchase.deliveredAt?.toMillis?.() ||
        (purchase.deliveredAt?.seconds ? purchase.deliveredAt.seconds * 1000 : 0);
      const createdAt =
        purchase.createdAt?.toMillis?.() ||
        (purchase.createdAt?.seconds ? purchase.createdAt.seconds * 1000 : 0);
      const now = Date.now();
      const elapsed = deliveredAt
        ? now - deliveredAt > 14 * 86400000
        : createdAt
          ? now - createdAt > 14 * 86400000
          : false;
      if (!elapsed) {
        return NextResponse.json(
          {
            error:
              "Sellers can mark the order complete 14 days after delivery, or wait for the buyer / auto-complete.",
          },
          { status: 400 }
        );
      }
    }

    if (!purchase.deliveredAt && !isAdmin) {
      return NextResponse.json(
        { error: "Buyer has not confirmed receipt yet" },
        { status: 400 }
      );
    }

    await db.collection("purchases").doc(purchaseId).update(orderCompletedPatch());

    await writeAuditLog({
      action: isAdmin ? "admin_complete_order" : "complete_order",
      actorEmail: decodedToken.email || "",
      purchaseId,
      metadata: {
        destinationCharge: purchase.destinationCharge === true,
        paymentType: purchase.paymentType || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: isStripeListingCheckout(purchase)
        ? "Order completed. Payment already went to the seller via Stripe at checkout."
        : "Order completed.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[release-payment/complete-order] Error:", msg);
    Sentry.captureException(e, {
      tags: { type: "order-completion" },
      extra: { purchaseId },
    });
    return NextResponse.json({ error: msg || "Failed to complete order" }, { status: 500 });
  }
}
