import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { normalizePaymentType } from "../../lib/listing-payment-type";

/** Authoritative paymentType for buyer checkout — never trust client Firestore cache. */
export async function GET(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get("listingId")?.trim();
  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  if (!isAdminInitialized()) {
    return NextResponse.json({ error: "Server unavailable" }, { status: 503 });
  }

  try {
    const snap = await getAdminDb().collection("listings").doc(listingId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const paymentType = normalizePaymentType(snap.data()?.paymentType);
    return NextResponse.json(
      { listingId, paymentType },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    console.error("[listing-checkout-mode]", e);
    return NextResponse.json({ error: "Failed to load listing" }, { status: 500 });
  }
}
