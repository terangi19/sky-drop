import { NextRequest, NextResponse } from "next/server";
import { isAdminInitialized } from "../../lib/firebase-admin";
import { applyRateLimit, authenticateRequest, isErrorResponse, requireEmail } from "../../lib/api-helpers";
import { acceptOfferWithAdmin } from "../../lib/purchase-service";
import type { AcceptOfferInput } from "../../lib/purchase-service";

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "accept-offer", 10);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const body = await req.json();
    const { listingId, buyerEmail, amount, offerMessageId, listingTitle, listingPrice, listingImage, collectionName } = body;

    if (!listingId || !buyerEmail || !amount || !offerMessageId) {
      return NextResponse.json({ error: "Missing required fields: listingId, buyerEmail, amount, offerMessageId" }, { status: 400 });
    }

    const emailErr = requireEmail(auth, "seller");
    if (emailErr) return emailErr;
    const sellerEmail = auth.email;

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
      const result = await acceptOfferWithRest(input, projectId, auth.idToken);
      return NextResponse.json({ success: true, ...result });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[accept-offer] Error:", msg);
    return NextResponse.json({ error: msg || "Failed to accept offer" }, { status: 500 });
  }
}
