import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { createPurchaseWithAdmin, createPurchaseWithRest } from "../../lib/purchase-service";
import type { CreatePurchaseInput } from "../../lib/purchase-service";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`create-purchase:${ip}`, 10, 60_000);
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
    const { listingId, sellerEmail, stripePaymentIntentId } = body;
    if (!listingId || !sellerEmail || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields: listingId, sellerEmail, stripePaymentIntentId" }, { status: 400 });
    }

    const buyerEmail = decodedToken.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const input: CreatePurchaseInput = {
      listingId: body.listingId,
      listingTitle: body.listingTitle || "",
      listingPrice: body.listingPrice || "",
      listingImage: body.listingImage || "",
      sellerEmail: body.sellerEmail,
      buyerEmail,
      buyerName: body.buyerName || buyerEmail,
      buyerPhone: body.buyerPhone || "",
      deliveryMethod: body.deliveryMethod || "pickup",
      shippingAddress: body.shippingAddress || "",
      shippingFee: body.shippingFee || 0,
      processingFee: body.processingFee || 1.00,
      total: body.total || 0,
      badgeTransfer: body.badgeTransfer || "",
      type: body.type || "physical",
      digitalFileURL: body.digitalFileURL || "",
      digitalFileName: body.digitalFileName || "",
      status: body.status || "pending",
      rentalStart: body.rentalStart || null,
      rentalEnd: body.rentalEnd || null,
      rentalDays: body.rentalDays || null,
      disputeDeadline: body.disputeDeadline || null,
      stripePaymentIntentId: body.stripePaymentIntentId,
      paidAt: body.paidAt || new Date().toISOString(),
      deliveredAt: body.deliveredAt || null,
      winningBid: body.winningBid || null,
      collectionName: body.collectionName || "listings",
    };

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";

    if (isAdminInitialized()) {
      const result = await createPurchaseWithAdmin(input);
      return NextResponse.json({ success: true, ...result });
    } else {
      const result = await createPurchaseWithRest(input, projectId, idToken);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (e: any) {
    console.error("[create-purchase] Error:", e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to create purchase" }, { status: 500 });
  }
}
