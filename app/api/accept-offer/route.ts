import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { acceptOfferWithAdmin, acceptOfferWithRest } from "../../lib/purchase-service";
import type { AcceptOfferInput } from "../../lib/purchase-service";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`accept-offer:${ip}`, 10, 60_000);
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
    const { listingId, buyerEmail, amount, offerMessageId, listingTitle, listingPrice, listingImage, collectionName } = body;

    if (!listingId || !buyerEmail || !amount || !offerMessageId) {
      return NextResponse.json({ error: "Missing required fields: listingId, buyerEmail, amount, offerMessageId" }, { status: 400 });
    }

    const sellerEmail = decodedToken.email || "";
    if (!sellerEmail) {
      return NextResponse.json({ error: "Could not determine seller email" }, { status: 400 });
    }

    const input: AcceptOfferInput = {
      listingId,
      listingTitle: listingTitle || "",
      listingPrice: listingPrice || "",
      listingImage: listingImage || "",
      sellerEmail,
      buyerEmail,
      amount: Number(amount),
      offerMessageId,
      collectionName: collectionName || "listings",
    };

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";

    if (isAdminInitialized()) {
      const result = await acceptOfferWithAdmin(input);
      return NextResponse.json({ success: true, ...result });
    } else {
      const { acceptOfferWithRest } = await import("../../lib/purchase-service");
      const result = await acceptOfferWithRest(input, projectId, idToken);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (e: any) {
    console.error("[accept-offer] Error:", e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to accept offer" }, { status: 500 });
  }
}

