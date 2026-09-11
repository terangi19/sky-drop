import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import {
  adminCreateCheckoutMessage,
  adminResolveListingSellerEmail,
} from "../../lib/checkout-server";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`checkout-msg:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const buyerEmail = decoded.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    if (!text || !listingId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sellerEmail = await adminResolveListingSellerEmail(listingId);
    if (sellerEmail.toLowerCase() === buyerEmail.toLowerCase()) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    const messageId = await adminCreateCheckoutMessage({
      text,
      sender: buyerEmail,
      receiver: sellerEmail,
      listingId,
    });

    return NextResponse.json({ success: true, messageId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkout-message]", msg);
    if (msg.includes("CHECKOUT_SERVER_NOT_CONFIGURED")) {
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    if (msg === "Listing not found" || msg === "Listing has no seller") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not send message" }, { status: 500 });
  }
}
