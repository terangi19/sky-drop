import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { acceptOfferWithAdmin } from "../../lib/purchase-service";
import type { AcceptOfferInput } from "../../lib/purchase-service";
import { requireVerifiedEmail } from "../../lib/require-verified";
import { requireKycApproved } from "../../lib/require-kyc";
import {
  isStripeCheckoutEnabledServer,
  listingCheckoutUnavailableBody,
} from "../../lib/stripe-checkout-flags";

export async function POST(req: NextRequest) {
  try {
    if (!isStripeCheckoutEnabledServer()) {
      return NextResponse.json(listingCheckoutUnavailableBody(), { status: 503 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`accept-offer:${ip}`, 8, 60_000);
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

    const verified = requireVerifiedEmail(decodedToken, "accepting offers");
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
    }

    const kyc = await requireKycApproved(decodedToken.uid);
    if (kyc.ok === false) {
      return NextResponse.json({ error: kyc.error }, { status: 403 });
    }

    const body = await req.json();
    const { listingId, buyerEmail, offerMessageId, listingTitle, listingPrice, listingImage, collectionName } = body;

    if (!listingId || !buyerEmail || !offerMessageId) {
      return NextResponse.json(
        { error: "Missing required fields: listingId, buyerEmail, offerMessageId" },
        { status: 400 }
      );
    }

    const sellerEmail = decodedToken.email || "";
    if (!sellerEmail) {
      return NextResponse.json({ error: "Could not determine seller email" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    // Amount must come from the offer message — never trust the client.
    const { getAdminDb } = await import("../../lib/firebase-admin");
    const offerMsgSnap = await getAdminDb().collection("messages").doc(offerMessageId).get();
    if (!offerMsgSnap.exists) {
      return NextResponse.json({ error: "Offer message not found" }, { status: 404 });
    }
    const offerMsgData = offerMsgSnap.data()!;
    if (offerMsgData.type !== "offer") {
      return NextResponse.json({ error: "Message is not an offer" }, { status: 400 });
    }
    if (offerMsgData.sender !== buyerEmail) {
      return NextResponse.json({ error: "Buyer email does not match offer sender" }, { status: 403 });
    }
    const offerAmount = Number(
      offerMsgData.offerAmount ?? offerMsgData.offer?.amount ?? NaN
    );
    if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
      return NextResponse.json({ error: "Offer message has no valid amount" }, { status: 400 });
    }

    const input: AcceptOfferInput = {
      listingId,
      listingTitle: listingTitle || "",
      listingPrice: listingPrice || "",
      listingImage: listingImage || "",
      sellerEmail,
      buyerEmail,
      amount: offerAmount,
      offerMessageId,
      collectionName: collectionName || "listings",
    };

    const result = await acceptOfferWithAdmin(input);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    console.error("[accept-offer] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to accept offer" },
      { status: 500 }
    );
  }
}

