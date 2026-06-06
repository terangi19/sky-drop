import { NextRequest, NextResponse } from "next/server";
import { isAdminInitialized } from "../../lib/firebase-admin";
import { getStripe } from "../../lib/stripe-server";
import { applyRateLimit, authenticateRequest, isErrorResponse, requireEmail } from "../../lib/api-helpers";
import { payOfferWithAdmin, payOfferWithRest } from "../../lib/purchase-service";
import type { PayOfferInput } from "../../lib/purchase-service";

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "pay-offer", 10);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const body = await req.json();
    const { purchaseId, stripePaymentIntentId, total } = body;

    if (!purchaseId || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields: purchaseId, stripePaymentIntentId" }, { status: 400 });
    }

    const emailErr = requireEmail(auth, "buyer");
    if (emailErr) return emailErr;
    const buyerEmail = auth.email;

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
      const result = await payOfferWithRest(input, auth.idToken);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pay-offer] Error:", msg);
    return NextResponse.json({ error: msg || "Failed to process offer payment" }, { status: 500 });
  }
}
