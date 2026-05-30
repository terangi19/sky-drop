import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

function isDisputeActive(disputeStatus?: string): boolean {
  return !!disputeStatus && ["open", "pending", "under_review"].includes(disputeStatus);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`release:${ip}`, 30, 60_000);
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
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { purchaseId } = await req.json();
    if (!purchaseId) {
      return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
    }

    const purchaseDoc = await getAdminDb().collection("purchases").doc(purchaseId).get();
    if (!purchaseDoc.exists) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }
    const purchase = purchaseDoc.data()!;

    // Must be either the seller or the buyer
    const isSeller = purchase.sellerEmail === decodedToken.email;
    const isBuyer = purchase.buyerEmail === decodedToken.email;
    if (!isSeller && !isBuyer) {
      return NextResponse.json({ error: "Not authorized for this purchase" }, { status: 403 });
    }

    if (purchase.status !== "delivered") {
      return NextResponse.json({ error: "Purchase must be in 'delivered' status to release funds" }, { status: 400 });
    }

    if (purchase.fundsReleased) {
      return NextResponse.json({ error: "Funds already released for this purchase" }, { status: 400 });
    }

    // Block release during active dispute
    if (isDisputeActive(purchase.disputeStatus)) {
      return NextResponse.json({ error: "Funds frozen — a dispute is in progress" }, { status: 400 });
    }

    // Only the buyer can trigger release (they confirmed receipt)
    // Seller cannot trigger release — must wait for buyer confirmation or auto-release
    if (isSeller) {
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
      const freshDoc = await getAdminDb().collection("purchases").doc(purchaseId).get();
      const freshData = freshDoc.data()!;
      if (isDisputeActive(freshData.disputeStatus)) {
        return NextResponse.json({ error: "Cannot release — dispute in progress" }, { status: 400 });
      }
    }

    // Verify deliveredAt exists (buyer confirmed)
    if (!purchase.deliveredAt && !isBuyer) {
      return NextResponse.json({ error: "Buyer has not confirmed receipt yet" }, { status: 400 });
    }

    const amount = Math.round((Number(purchase.total) - 1.00) * 100);
    if (amount <= 0) {
      return NextResponse.json({ error: "No funds to release" }, { status: 400 });
    }

    const profileDoc = await getAdminDb().collection("profiles").doc(decodedToken.uid).get();
    const stripeAccountId = profileDoc.data()?.stripeConnectId;
    if (!stripeAccountId) {
      return NextResponse.json({ error: "No Stripe Connect account linked. Set up payouts in your profile." }, { status: 400 });
    }

    // For seller auto-release, use the seller's Stripe account
    let sellerStripeAccountId = stripeAccountId;
    if (isBuyer) {
      const sellerProfileDocs = await getAdminDb().collection("profiles").where("email", "==", purchase.sellerEmail).limit(1).get();
      const sellerProfile = sellerProfileDocs.docs[0]?.data();
      sellerStripeAccountId = sellerProfile?.stripeConnectId;
      if (!sellerStripeAccountId) {
        return NextResponse.json({ error: "Seller has not set up payouts." }, { status: 400 });
      }
    }

    const idempotencyKey = `release-${purchaseId}`;

    let transfer;
    await getAdminDb().runTransaction(async (transaction) => {
      const purchaseTx = await transaction.get(getAdminDb().collection("purchases").doc(purchaseId));
      if (!purchaseTx.exists) {
        throw new Error("Purchase not found");
      }
      const purchaseTxData = purchaseTx.data()!;
      if (purchaseTxData.fundsReleased) {
        throw new Error("Funds already released for this purchase");
      }
      if (isDisputeActive(purchaseTxData.disputeStatus)) {
        throw new Error("Funds frozen — dispute in progress");
      }

      transfer = await getStripe().transfers.create(
        {
          amount,
          currency: "nzd",
          destination: sellerStripeAccountId,
          metadata: { purchaseId, listingTitle: purchase.listingTitle },
        },
        { idempotencyKey }
      );

      transaction.update(getAdminDb().collection("purchases").doc(purchaseId), {
        fundsReleased: true,
        fundsReleasedAt: new Date(),
        stripeTransferId: transfer.id,
        status: "completed",
      });
    });

    return NextResponse.json({ success: true, transferId: transfer.id });
  } catch (e: any) {
    console.error("[release-payment] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to release funds" }, { status: 500 });
  }
}
