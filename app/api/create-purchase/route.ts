import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { createPurchaseWithAdmin } from "../../lib/purchase-service";
import type { CreatePurchaseInput } from "../../lib/purchase-service";
import { validateSellerForCheckout } from "../../lib/seller-payments";
import {
  adminGetListing,
  adminGetSellerProfileByEmail,
  requireAdminForCheckout,
} from "../../lib/checkout-server";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`create-purchase:${ip}`, 10, 60_000);
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
    const { listingId, stripePaymentIntentId } = body;
    if (!listingId || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields: listingId, stripePaymentIntentId" }, { status: 400 });
    }

    const buyerEmail = decodedToken.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const collectionName = body.collectionName || "listings";
    requireAdminForCheckout();

    const listingData = await adminGetListing(collectionName, listingId);
    if (!listingData) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    const sellerEmail = String(listingData.sellerEmail || "");
    if (!sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (sellerEmail === buyerEmail) {
      return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
    }

    const sellerProfile = await adminGetSellerProfileByEmail(sellerEmail);
    const sellerError = validateSellerForCheckout(sellerProfile);
    if (sellerError) {
      const status = sellerError.includes("restricted") || sellerError.includes("verified") ? 403 : 400;
      return NextResponse.json({ error: sellerError }, { status });
    }

    const input: CreatePurchaseInput = {
      listingId: body.listingId,
      listingTitle: body.listingTitle || "",
      listingPrice: body.listingPrice || "",
      listingImage: body.listingImage || "",
      sellerEmail,
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

    const result = await createPurchaseWithAdmin(input);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create purchase";
    console.error("[create-purchase] Error:", msg);
    if (msg.includes("CHECKOUT_SERVER_NOT_CONFIGURED")) {
      return NextResponse.json(
        {
          error:
            "Purchase could not be recorded. FIREBASE_SERVICE_ACCOUNT must be set on the server.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

