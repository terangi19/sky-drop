import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../lib/firebase-admin";
import { authenticateRequest, isErrorResponse } from "../../lib/api-helpers";
import { isAdminEmail } from "../../lib/admin-check";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    if (!isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const expiresAt = new Date(Date.now() + 60 * 86400000);

    const docRef = await getAdminDb().collection("listings").add({
      title: "Test Item - Buy Me",
      description: "A test listing for testing the purchase and bid flow. Please ignore.",
      price: "25.00",
      category: "Tech",
      type: "physical",
      status: "live",
      saleType: "buy_now",
      condition: "New",
      location: "Auckland",
      pickupAvailable: true,
      shippingAvailable: true,
      shippingFee: 8,
      freeShipping: false,
      sellerEmail: "test@skydrop.nz",
      sellerUsername: "test",
      sellerId: "test",
      views: 0,
      bidCount: 0,
      images: [],
      imageUrl: "",
      createdAt: now,
      expiresAt,
    });

    return NextResponse.json({ success: true, listingId: docRef.id, url: `/post/listing/${docRef.id}` });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
