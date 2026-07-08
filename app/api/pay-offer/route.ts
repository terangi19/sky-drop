import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { getStripe } from "../../lib/stripe-server";
import { rateLimit } from "../../lib/rate-limit";
import { payOfferWithAdmin, payOfferWithRest } from "../../lib/purchase-service";
import type { PayOfferInput } from "../../lib/purchase-service";
import { requireVerifiedEmail } from "../../lib/require-verified";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`pay-offer:${ip}`, 10, 60_000);
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

    const verified = requireVerifiedEmail(decodedToken, "paying for an offer");
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
    }

    const body = await req.json();
    const { purchaseId, stripePaymentIntentId, total } = body;

    if (!purchaseId || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields: purchaseId, stripePaymentIntentId" }, { status: 400 });
    }

    const buyerEmail = decodedToken.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    // Verify the PaymentIntent with Stripe before trusting client-provided PI ID
    const stripe = getStripe();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    } catch {
      return NextResponse.json({ error: "Invalid PaymentIntent ID" }, { status: 400 });
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({ error: `Payment has not succeeded (status: ${paymentIntent.status})` }, { status: 400 });
    }

    const metadata = paymentIntent.metadata || {};
    if (metadata.purchaseId && metadata.purchaseId !== purchaseId) {
      return NextResponse.json({ error: "Payment does not match this accepted offer" }, { status: 400 });
    }
    if (metadata.buyerEmail && metadata.buyerEmail !== buyerEmail) {
      return NextResponse.json({ error: "Payment does not match your account" }, { status: 400 });
    }

    const totalCents = Math.round((Number(total) || 0) * 100);
    if (totalCents > 0 && paymentIntent.amount !== totalCents) {
      return NextResponse.json({ error: "PaymentIntent amount does not match purchase total" }, { status: 400 });
    }

    const input: PayOfferInput = {
      purchaseId,
      stripePaymentIntentId,
      total: Number(total) || 0,
      buyerEmail,
    };

    if (isAdminInitialized()) {
      const result = await payOfferWithAdmin(input);
      return NextResponse.json({ success: true, ...result });
    } else {
      const result = await payOfferWithRest(input, idToken);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (e: any) {
    console.error("[pay-offer] Error:", e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to process offer payment" }, { status: 500 });
  }
}

