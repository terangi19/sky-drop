import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { getAdminAuth, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`release:${ip}`, 30, 60_000);
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
      decodedToken = await getAdminAuth().verifyIdToken(idToken);
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
    if (purchase.sellerEmail !== decodedToken.email) {
      return NextResponse.json({ error: "You can only release funds for your own sales" }, { status: 403 });
    }
    if (purchase.status !== "delivered") {
      return NextResponse.json({ error: "Purchase must be in 'delivered' status to release funds" }, { status: 400 });
    }
    if (purchase.fundsReleased) {
      return NextResponse.json({ error: "Funds already released for this purchase" }, { status: 400 });
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

    const transfer = await getStripe().transfers.create({
      amount,
      currency: "nzd",
      destination: stripeAccountId,
      metadata: { purchaseId, listingTitle: purchase.listingTitle },
    });

    await getAdminDb().collection("purchases").doc(purchaseId).update({
      fundsReleased: true,
      fundsReleasedAt: new Date(),
      stripeTransferId: transfer.id,
      status: "completed",
    });

    return NextResponse.json({ success: true, transferId: transfer.id });
  } catch (e: any) {
    console.error("[release-payment] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to release funds" }, { status: 500 });
  }
}
