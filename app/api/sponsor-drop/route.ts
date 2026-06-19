import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const { allowed } = await rateLimit(`sponsor:${ip}`, 3, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
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

    const { listingId, listingTitle, sellerEmail, targetPage } = await req.json();
    if (!listingId || !sellerEmail || !targetPage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (decodedToken.email !== sellerEmail) {
      return NextResponse.json({ error: "You can only sponsor your own listings" }, { status: 403 });
    }

    const db = getServerDb(idToken);
    const listingDoc = await db.collection("listings").doc(listingId).get();
    if (!listingDoc.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const listingData = listingDoc.data()!;
    if (listingData.sellerEmail !== sellerEmail) {
      return NextResponse.json({ error: "Listing does not belong to you" }, { status: 403 });
    }

    const s = getStripe();
    const paymentIntent = await s.paymentIntents.create(
      {
        amount: 500,
        currency: "nzd",
        automatic_payment_methods: { enabled: true },
        metadata: { listingId, listingTitle: listingTitle || "", sellerEmail, sellerUid: decodedToken.uid, type: "sponsor" },
      },
      { idempotencyKey: `sponsor-${listingId}` }
    );

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (e: any) {
    console.error("Sponsor drop intent error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

