import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { getServerDb } from "../../lib/firebase-admin";
import { applyRateLimit, authenticateRequest, isErrorResponse } from "../../lib/api-helpers";

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "bump", 5);
  if (limited) return limited;

  try {
    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const { listingId } = await req.json();
    if (!listingId) {
      return NextResponse.json({ error: "Missing listingId" }, { status: 400 });
    }

    // Verify listing exists and belongs to the authenticated user
    const db = getServerDb(auth.idToken);
    const listingDoc = await db.collection("listings").doc(listingId).get();
    if (!listingDoc.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const listingData = listingDoc.data()!;
    if (listingData.sellerEmail !== auth.email) {
      return NextResponse.json({ error: "You do not own this listing" }, { status: 403 });
    }

    const s = getStripe();
    const paymentIntent = await s.paymentIntents.create({
      amount: 500,
      currency: "nzd",
      automatic_payment_methods: { enabled: true },
      metadata: { listingId, sellerEmail: auth.email || "", type: "bump" },
    });
    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Bump intent error:", msg);
    return NextResponse.json({ error: msg || "Failed" }, { status: 500 });
  }
}
