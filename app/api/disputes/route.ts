import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sellerPayoutCents } from "../../lib/purchase-service";
import { isAdminEmail } from "../../lib/admin-check";
import { writeAuditLog } from "../../lib/admin-utils";
import { notifyAdmin } from "../../lib/admin-alerts";

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
      const { purchaseId, amount, reason } = body;
      if (!purchaseId) {
        return NextResponse.json({ error: "Missing purchase ID" }, { status: 400 });
      }

      const purchaseDoc = await db.collection("purchases").doc(purchaseId).get();
      if (!purchaseDoc.exists) {
        return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
      }
      const purchaseData = purchaseDoc.data()!;
      if (purchaseData.buyerEmail !== decodedToken.email && !isAdminEmail(decodedToken.email)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      const piId = purchaseData.stripePaymentIntentId;
      if (!piId) {
        return NextResponse.json({ error: "No PaymentIntent on this purchase" }, { status: 400 });
      }

      if (purchaseData.fundsReleased) {
        return NextResponse.json({ error: "Funds already released, cannot refund" }, { status: 400 });
      }

      const parsedAmount = Number(amount);
      const refundAmount = amount && !isNaN(parsedAmount) ? Math.round(parsedAmount * 100) : undefined;

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

      if (purchaseData.fundsReleased) {
        return NextResponse.json({ error: "Funds already released" }, { status: 400 });
      }

      // Look up seller's Stripe Connect account
      const sellerProfileDocs = await db.collection("profiles").where("email", "==", purchaseData.sellerEmail).limit(1).get();
      const sellerProfile = sellerProfileDocs.docs[0]?.data();
      const sellerStripeAccountId = sellerProfile?.stripeAccountId;
      if (!sellerStripeAccountId) {
        return NextResponse.json({ error: "Seller has not set up payouts" }, { status: 400 });
      }

      const amount = sellerPayoutCents(purchaseData);
      if (amount <= 0) {
        return NextResponse.json({ error: "No funds to release" }, { status: 400 });
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        return NextResponse.json({ error: "Payments not configured" }, { status: 500 });
      }

      const idempotencyKey = `dispute-release-${purchaseId}`;
      const transfer = await getStripe().transfers.create(
        {
          amount,
          currency: "nzd",
          destination: sellerStripeAccountId,
          metadata: { purchaseId, listingTitle: purchaseData.listingTitle || "", disputeRelease: "true" },
        },
        { idempotencyKey }
      );

      await db.collection("purchases").doc(purchaseId).update({
        fundsReleased: true,
        fundsReleasedAt: new Date(),
        stripeTransferId: transfer.id,
        status: "completed",
        disputeStatus: "resolved_seller",
        disputeResolvedAt: new Date(),
        disputeResolvedBy: decodedToken.email,
      });

      await writeAuditLog({
        action: "admin_dispute_release_payment",
        actorEmail: decodedToken.email || "",
        purchaseId,
        amount: Math.round(amount / 100),
        metadata: { transferId: transfer.id, disputeResolution: "seller_wins" },
      });

      await notifyAdmin({
        type: "dispute_resolved",
        title: "Dispute Resolved — Payment Released to Seller",
        message: `Purchase ${purchaseId}: $${(amount / 100).toFixed(2)} released to seller.`,
        metadata: { purchaseId, transferId: transfer.id, amount: Math.round(amount / 100) },
      });

      const db2 = db;
      const now2 = new Date();
      for (const email of [purchaseData.buyerEmail, purchaseData.sellerEmail]) {
        await db2.collection("notifications").add({
          targetEmail: email,
          fromEmail: "system@skydrop.nz",
          type: "dispute_resolved",
          title: email === purchaseData.sellerEmail ? "Dispute Resolved — Payment Released" : "Dispute Resolved — Funds Released to Seller",
          message: email === purchaseData.sellerEmail
            ? `The dispute for "${purchaseData.listingTitle || ""}" has been resolved in your favor. Payment of $${(amount / 100).toFixed(2)} has been released.`
            : `The dispute for "${purchaseData.listingTitle || ""}" has been resolved. Funds have been released to the seller.`,
          listingId: purchaseData.listingId || "",
          listingTitle: purchaseData.listingTitle || "",
          read: false,
          createdAt: now2,
        });
      }

      return NextResponse.json({ success: true, transferId: transfer.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[disputes] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: "Could not process request. Please try again." }, { status: 500 });
  }
}

