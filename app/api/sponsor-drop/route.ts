import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { getServerDb } from "../../lib/firebase-admin";
import { applyRateLimit, authenticateRequest, isErrorResponse } from "../../lib/api-helpers";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "sponsor", 3);
  if (limited) return limited;

  try {
    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const { listingId, listingTitle, sellerEmail, targetPage } = await req.json();
    if (!listingId || !sellerEmail || !targetPage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (auth.email !== sellerEmail) {
      return NextResponse.json({ error: "You can only sponsor your own listings" }, { status: 403 });
    }

    const db = getServerDb(auth.idToken);
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
        metadata: { listingId, sellerEmail, sellerUid: auth.uid, type: "sponsor" },
      },
      { idempotencyKey: `sponsor-${listingId}` }
    );

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Sponsor drop intent error:", msg);
    return NextResponse.json({ error: msg || "Failed" }, { status: 500 });
  }
}
