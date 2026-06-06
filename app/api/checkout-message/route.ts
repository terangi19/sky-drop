import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, authenticateRequest, isErrorResponse, requireEmail } from "../../lib/api-helpers";
import { adminCreateCheckoutMessage } from "../../lib/checkout-server";

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "checkout-msg", 20);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const emailErr = requireEmail(auth, "buyer");
    if (emailErr) return emailErr;

    const { text, sellerEmail, listingId } = await req.json();
    if (!text?.trim() || !sellerEmail || !listingId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const messageId = await adminCreateCheckoutMessage({
      text: String(text).trim(),
      sender: auth.email,
      receiver: String(sellerEmail),
      listingId: String(listingId),
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
    return NextResponse.json({ error: "Could not send message" }, { status: 500 });
  }
}
