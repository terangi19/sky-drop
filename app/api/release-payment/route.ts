import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sellerPayoutCents } from "../../lib/purchase-service";
import { isAdminEmail } from "../../lib/admin-check";
import { writeAuditLog } from "../../lib/admin-utils";
import { notifyAdmin, writeFailureRecord } from "../../lib/admin-alerts";
import * as Sentry from "@sentry/nextjs";

function isDisputeActive(disputeStatus?: string): boolean {
  return !!disputeStatus && ["open", "pending", "under_review"].includes(disputeStatus);
}

export async function POST(req: NextRequest) {
  let decodedToken: any;
  let purchaseId: string | undefined;
  let purchase: any;

  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`release:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payments not configured" }, { status: 500 });
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

    const db = getServerDb(idToken);

    const body = await req.json();
    purchaseId = body.purchaseId;
    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    const purchaseDoc = await db.collection("purchases").doc(purchaseId).get();
    if (!purchaseDoc.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }
    purchase = purchaseDoc.data()!;

    // Must be either the seller, the buyer, or an admin
    const isSeller = purchase.sellerEmail === decodedToken.email;
    const isBuyer = purchase.buyerEmail === decodedToken.email;
    const isAdmin = isAdminEmail(decodedToken.email || "");
    if (!isSeller && !isBuyer && !isAdmin) {
      return NextResponse.json({ error: "Not authorized for this purchase" }, { status: 403 });
    }

    if (purchase.status !== "delivered") {
      return NextResponse.json({ error: "Purchase must be in 'delivered' status to release funds" }, { status: 400 });
    }

    if (purchase.fundsReleased || purchase.stripeTransferId) {
      return NextResponse.json({
        success: true,
        transferId: purchase.stripeTransferId || null,
        message: "Funds already released",
      });
    }

    // Block release during active dispute (unless admin overriding)
    if (isDisputeActive(purchase.disputeStatus) && !isAdmin) {
      return NextResponse.json({ error: "Funds frozen — a dispute is in progress" }, { status: 400 });
    }

    // Only the buyer can trigger release (they confirmed receipt)
    // Seller cannot trigger release — must wait for buyer confirmation or auto-release
    // Admin can bypass all restrictions
    if (isAdmin) {
      // Admin can release regardless of dispute or timing
    } else if (isSeller) {
      // Check if auto-release window has passed (72 hours after deliveredAt or 14 days after createdAt)
      const deliveredAt = purchase.deliveredAt?.toMillis?.() || purchase.deliveredAt?.seconds * 1000;
      const createdAt = purchase.createdAt?.toMillis?.() || purchase.createdAt?.seconds * 1000;
      const now = Date.now();
      const autoReleaseElapsed = deliveredAt
        ? (now - deliveredAt) > 72 * 3600000  // 72 hours after delivery confirmation
        : (now - createdAt) > 14 * 86400000;   // 14 days after purchase

      if (!autoReleaseElapsed) {
        return NextResponse.json({ error: "Funds are held in escrow until the buyer confirms receipt. Auto-release will trigger after 3 days." }, { status: 400 });
      }

      // Double-check no dispute was opened since the start of this request
      const freshDoc = await db.collection("purchases").doc(purchaseId).get();
      const freshData = freshDoc.data()!;
      if (isDisputeActive(freshData.disputeStatus)) {
        return NextResponse.json({ error: "Cannot release — dispute in progress" }, { status: 400 });
      }
    }

    if (!purchase.deliveredAt && !isAdmin) {
      return NextResponse.json(
        { error: "Buyer has not confirmed receipt yet" },
        { status: 400 }
      );
    }

    const amount = sellerPayoutCents(purchase);
    if (amount <= 0) {
      return NextResponse.json({ error: "No funds to release" }, { status: 400 });
    }

    // Admin always pays to the seller; seller uses own account; buyer pays to seller
    let sellerStripeAccountId: string | undefined;
    if (isAdmin || isBuyer) {
      const sellerProfileDocs = await db.collection("profiles").where("email", "==", purchase.sellerEmail).limit(1).get();
      const sellerProfile = sellerProfileDocs.docs[0]?.data();
      sellerStripeAccountId = sellerProfile?.stripeAccountId;
    } else {
      const profileDoc = await db.collection("profiles").doc(decodedToken.uid).get();
      sellerStripeAccountId = profileDoc.data()?.stripeAccountId;
    }
    if (!sellerStripeAccountId) {
      return NextResponse.json({ error: "Seller has not set up payouts." }, { status: 400 });
    }

    const idempotencyKey = `release-${purchaseId}`;

    // Step 1: Verify purchase state atomically (read-only Firestore transaction)
    await db.runTransaction(async (transaction) => {
      const purchaseTx = await transaction.get(db.collection("purchases").doc(purchaseId));
      if (!purchaseTx.exists) {
        throw new Error("Purchase not found");
      }
      const purchaseTxData = purchaseTx.data()!;
      if (purchaseTxData.fundsReleased || purchaseTxData.stripeTransferId) {
        throw new Error("Funds already released for this purchase");
      }
      if (purchaseTxData.status !== "delivered") {
        throw new Error("Purchase must be in 'delivered' status to release funds");
      }
      if (isDisputeActive(purchaseTxData.disputeStatus) && !isAdmin) {
        throw new Error("Funds frozen — dispute in progress");
      }
    });

    // Step 2: Create Stripe transfer (outside transaction — point of no return)
    const transfer = await getStripe().transfers.create(
      {
        amount,
        currency: "nzd",
        destination: sellerStripeAccountId,
        metadata: { purchaseId, listingTitle: purchase.listingTitle },
      },
      { idempotencyKey }
    );

    // Step 3: Update purchase record with retry (outside transaction; idempotent re-attempt possible)
    let updated = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await db.collection("purchases").doc(purchaseId).update({
          fundsReleased: true,
          fundsReleasedAt: new Date(),
          stripeTransferId: transfer.id,
          status: "completed",
        });
        updated = true;
        break;
      } catch (writeErr) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        else throw writeErr;
      }
    }

    if (!updated) {
      // Last resort: try to persist at least stripeTransferId so future retries are idempotent
      try {
        await db.collection("purchases").doc(purchaseId).update({
          stripeTransferId: transfer.id,
        });
      } catch {}
      throw new Error("Failed to update purchase record after Stripe transfer succeeded");
    }

    await writeAuditLog({
      action: isAdmin ? "admin_force_release_payment" : "release_payment",
      actorEmail: decodedToken.email || "",
      purchaseId,
      amount: Math.round(amount / 100),
      metadata: { transferId: transfer.id, strikerTransferId: transfer.id, adminOverride: isAdmin },
    });

    return NextResponse.json({ success: true, transferId: transfer.id });
  } catch (e: any) {
    console.error("[release-payment] Error:", e?.code || e?.message || e);
    Sentry.captureException(e, { tags: { type: "payment-release" }, extra: { purchaseId, listingTitle: purchase?.listingTitle } });

    const errorMsg = e?.message || e?.code || "Unknown error";
    await writeFailureRecord("paymentReleaseFailures", {
      purchaseId,
      sellerEmail: purchase?.sellerEmail || "unknown",
      buyerEmail: purchase?.buyerEmail || "unknown",
      stripeTransferError: errorMsg,
    });
    await writeAuditLog({
      action: "release_payment_failed",
      actorEmail: decodedToken?.email || "unknown",
      purchaseId,
      metadata: { error: errorMsg, listingTitle: purchase?.listingTitle },
    });
    await notifyAdmin({
      type: "payment_release_failure",
      title: "Escrow Payment Release Failed",
      message: `Purchase ${purchaseId}: ${errorMsg}`,
      metadata: {
        purchaseId,
        sellerEmail: purchase?.sellerEmail,
        buyerEmail: purchase?.buyerEmail,
        listingTitle: purchase?.listingTitle,
        amount: purchase?.total,
        error: errorMsg,
      },
    });

    return NextResponse.json({ error: e.message || "Failed to release funds" }, { status: 500 });
  }
}

