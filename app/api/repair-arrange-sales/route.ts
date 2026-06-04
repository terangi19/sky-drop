import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import { repairMissingArrangePurchasesForSeller } from "../../lib/purchase-service";

/** Backfill purchases for Arrange Purchase sales that predate purchase-record creation. */
export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

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

    const email = decoded.email || "";
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const repaired = await repairMissingArrangePurchasesForSeller(email);
    return NextResponse.json({ success: true, repaired });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Repair failed";
    console.error("[repair-arrange-sales]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
