import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`dispute:${ip}`, 5, 60_000);
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

    const body = await req.json();
    const { action } = body;

    if (action === "refund") {
      const { purchaseId, stripePaymentIntentId, amount, reason } = body;
      if (!stripePaymentIntentId || !purchaseId) {
        return NextResponse.json({ error: "Missing payment intent ID or purchase ID" }, { status: 400 });
      }

      const ADMIN_EMAILS = ["rangitr16@gmail.com"];

      const purchaseDoc = await getAdminDb().collection("purchases").doc(purchaseId).get();
      if (!purchaseDoc.exists) {
        return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
      }
      const purchaseData = purchaseDoc.data()!;
      if (purchaseData.buyerEmail !== decodedToken.email && !ADMIN_EMAILS.includes(decodedToken.email || "")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      if (purchaseData.fundsReleased) {
        return NextResponse.json({ error: "Funds already released, cannot refund" }, { status: 400 });
      }

      const refundAmount = amount ? Math.round(Number(amount) * 100) : undefined;

      const refund = await getStripe().refunds.create({
        payment_intent: stripePaymentIntentId,
        amount: refundAmount,
        reason: "requested_by_customer",
        metadata: { purchaseId, reason: reason || "Dispute resolved in buyer's favor" },
      });

      await getAdminDb().collection("purchases").doc(purchaseId).update({
        status: "refunded",
        refundedAt: new Date(),
        refundId: refund.id,
      });

      return NextResponse.json({ success: true, refundId: refund.id, status: refund.status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[disputes] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: "Could not process request. Please try again." }, { status: 500 });
  }
}
