import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { isAdminEmail } from "../../lib/admin-utils";

export async function POST(req: NextRequest) {
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

    if (!isAdminEmail(decodedToken.email)) {
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
