import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isAdminEmail } from "../../lib/admin-check";
import { writeAuditLog } from "../../lib/admin-utils";
import { notifyAdmin } from "../../lib/admin-alerts";
import { logSecurityWarning } from "../../lib/security-log";
import {
  isOrderCompleted,
  isStripeListingCheckout,
  orderCompletedPatch,
} from "../../lib/payment-order-completion";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`dispute:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const db = getServerDb(idToken);

    const body = await req.json();
    const { action } = body;

    if (action === "refund") {
      if (!isAdminEmail(decodedToken.email)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const { purchaseId, amount, reason } = body;
      if (!purchaseId) {
        return NextResponse.json({ error: "Missing purchase ID" }, { status: 400 });
      }

      const purchaseDoc = await db.collection("purchases").doc(purchaseId).get();
      if (!purchaseDoc.exists) {
        return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
      }
      const purchaseData = purchaseDoc.data()!;

      const disputeStatus = String(purchaseData.disputeStatus || "");
      if (!["open", "pending", "under_review"].includes(disputeStatus)) {
        return NextResponse.json({ error: "No active dispute for this purchase" }, { status: 400 });
      }

      const openDisputes = await db.collection("disputes")
        .where("purchaseId", "==", purchaseId)
        .limit(5)
        .get();
      const hasOpenDispute = openDisputes.docs.some((d: QueryDocumentSnapshot) => {
        const status = String(d.data().status || "");
        return status === "open" || status === "under_review";
      });
      if (!hasOpenDispute) {
        return NextResponse.json({ error: "No open dispute record found" }, { status: 400 });
      }

      if (purchaseData.status === "refunded") {
        return NextResponse.json({ error: "Purchase already refunded" }, { status: 400 });
      }

      const piId = purchaseData.stripePaymentIntentId;
      if (!piId) {
        return NextResponse.json({ error: "No PaymentIntent on this purchase" }, { status: 400 });
      }

      // Refund eligibility is based on Stripe PI + dispute state — not orderCompleted.
      // Destination charges reverse from the connected account via Stripe refunds.

      const parsedAmount = Number(amount);
      const refundAmount = amount && !isNaN(parsedAmount) ? Math.round(parsedAmount * 100) : undefined;

      const purchaseTotalCents = Math.round((Number(purchaseData.total) || 0) * 100);
      if (purchaseTotalCents > 0 && refundAmount !== undefined && refundAmount > purchaseTotalCents) {
        return NextResponse.json({ error: "Refund amount exceeds purchase total" }, { status: 400 });
      }

      const refund = await getStripe().refunds.create({
        payment_intent: piId,
        amount: refundAmount,
        reason: "requested_by_customer",
        metadata: { purchaseId, reason: reason || "Dispute resolved in buyer's favor" },
      });

      await db.collection("purchases").doc(purchaseId).update({
        status: "refunded",
        refundedAt: new Date(),
        refundId: refund.id,
        orderCompleted: false,
        disputeStatus: "refunded",
        disputeResolvedAt: new Date(),
        disputeResolvedBy: decodedToken.email,
      });

      await logSecurityWarning("dispute_refund_issued", `Refund of ${refundAmount ? (refundAmount/100).toFixed(2) : "full"} issued for purchase ${purchaseId}`, {
        actorEmail: decodedToken.email,
        metadata: { purchaseId, amount: refundAmount, reason, stripeRefundId: refund.id },
      });

      await writeAuditLog({
        action: "refund",
        actorEmail: decodedToken.email || "",
        purchaseId,
        amount: refundAmount ? Math.round(refundAmount / 100) : undefined,
        metadata: { reason, stripeRefundId: refund.id },
      });

      await notifyAdmin({
        type: "dispute_resolved",
        title: "Dispute Resolved — Refund Issued",
        message: `Purchase ${purchaseId}: $${refundAmount ? (refundAmount / 100).toFixed(2) : "full"} refunded to buyer. Reason: ${reason || "N/A"}`,
        metadata: { purchaseId, refundId: refund.id, reason, amount: refundAmount },
      });

      const now = new Date();
      for (const email of [purchaseData.buyerEmail, purchaseData.sellerEmail]) {
        await db.collection("notifications").add({
          targetEmail: email,
          fromEmail: "system@skydrop.nz",
          type: "dispute_resolved",
          title: email === purchaseData.buyerEmail ? "Dispute Resolved — Refund Issued" : "Dispute Resolved — Refund Issued to Buyer",
          message: email === purchaseData.buyerEmail
            ? `Your dispute for "${purchaseData.listingTitle || ""}" has been resolved. A refund of $${refundAmount ? (refundAmount / 100).toFixed(2) : "full"} has been issued.`
            : `A dispute for "${purchaseData.listingTitle || ""}" has been resolved. A refund has been issued to the buyer.`,
          listingId: purchaseData.listingId || "",
          listingTitle: purchaseData.listingTitle || "",
          read: false,
          createdAt: now,
        });
      }

      return NextResponse.json({ success: true, refundId: refund.id, status: refund.status });
    }

    if (action === "release") {
      // Admin resolves dispute in seller's favor — completes the order.
      // Does NOT create Stripe transfers (destination charges already paid the seller).
      const { purchaseId } = body;
      if (!purchaseId) {
        return NextResponse.json({ error: "Missing purchase ID" }, { status: 400 });
      }
      if (!isAdminEmail(decodedToken.email)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }

      const purchaseDoc = await db.collection("purchases").doc(purchaseId).get();
      if (!purchaseDoc.exists) {
        return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
      }
      const purchaseData = purchaseDoc.data()!;

      if (isOrderCompleted(purchaseData) && purchaseData.disputeStatus === "resolved_seller") {
        return NextResponse.json({ error: "Dispute already resolved for the seller" }, { status: 400 });
      }

      if (
        String(purchaseData.paymentType || "").toLowerCase() !== "contact" &&
        !isStripeListingCheckout(purchaseData) &&
        purchaseData.destinationCharge === false &&
        purchaseData.stripePaymentIntentId
      ) {
        return NextResponse.json(
          {
            error:
              "This order used a retired payment path. Contact engineering — manual Stripe transfers are disabled.",
          },
          { status: 400 }
        );
      }

      await db.collection("purchases").doc(purchaseId).update({
        ...orderCompletedPatch(),
        disputeStatus: "resolved_seller",
        disputeResolvedAt: new Date(),
        disputeResolvedBy: decodedToken.email,
      });

      await writeAuditLog({
        action: "admin_dispute_resolve_seller",
        actorEmail: decodedToken.email || "",
        purchaseId,
        metadata: {
          disputeResolution: "seller_wins",
          destinationCharge: purchaseData.destinationCharge === true,
        },
      });

      await notifyAdmin({
        type: "dispute_resolved",
        title: "Dispute Resolved — Seller Wins",
        message: `Purchase ${purchaseId}: dispute resolved in seller's favor. Order marked completed.`,
        metadata: { purchaseId },
      });

      const now2 = new Date();
      for (const email of [purchaseData.buyerEmail, purchaseData.sellerEmail]) {
        await db.collection("notifications").add({
          targetEmail: email,
          fromEmail: "system@skydrop.nz",
          type: "dispute_resolved",
          title:
            email === purchaseData.sellerEmail
              ? "Dispute Resolved in Your Favor"
              : "Dispute Resolved — Seller Wins",
          message:
            email === purchaseData.sellerEmail
              ? `The dispute for "${purchaseData.listingTitle || ""}" was resolved in your favor. The order is complete. (Stripe Checkout payments already went to your connected account at purchase time.)`
              : `The dispute for "${purchaseData.listingTitle || ""}" was resolved in the seller's favor.`,
          listingId: purchaseData.listingId || "",
          listingTitle: purchaseData.listingTitle || "",
          read: false,
          createdAt: now2,
        });
      }

      return NextResponse.json({
        success: true,
        message: isStripeListingCheckout(purchaseData)
          ? "Dispute resolved. Payment already went to the seller via Stripe at checkout."
          : "Dispute resolved. Order completed.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    console.error("[disputes] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not process request. Please try again." }, { status: 500 });
  }
}
