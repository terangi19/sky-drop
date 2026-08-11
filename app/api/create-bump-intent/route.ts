import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import {
  isStripeCheckoutEnabledServer,
  listingCheckoutUnavailableBody,
} from "../../lib/stripe-checkout-flags";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const { allowed } = await rateLimit(`bump:${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  if (!isStripeCheckoutEnabledServer()) {
    return NextResponse.json(listingCheckoutUnavailableBody(), { status: 403 });
  }

  try {
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

    const { listingId } = await req.json();
    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
    }

    // Verify listing exists and belongs to the authenticated user
    const db = getServerDb(idToken);
    const listingDoc = await db.collection("listings").doc(listingId).get();
    if (!listingDoc.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const listingData = listingDoc.data()!;
    if (listingData.sellerEmail !== decodedToken.email) {
      return NextResponse.json({ error: "You do not own this listing" }, { status: 403 });
    }

    const s = getStripe();
    const paymentIntent = await s.paymentIntents.create({
      amount: 500,
      currency: "nzd",
      automatic_payment_methods: { enabled: true },
      metadata: { listingId, sellerEmail: decodedToken.email || "", type: "bump" },
    });
    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (e: any) {
    console.error("Bump intent error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

