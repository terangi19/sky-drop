import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isErrorResponse, requireEmail } from "../../lib/api-helpers";
import { requireAdminForCheckout } from "../../lib/checkout-server";
import { repairMissingArrangePurchasesForSeller } from "../../lib/purchase-service";

/** Backfill purchases for Arrange Purchase sales that predate purchase-record creation. */
export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const emailErr = requireEmail(auth);
    if (emailErr) return emailErr;
    const email = auth.email;

    const repaired = await repairMissingArrangePurchasesForSeller(email);
    return NextResponse.json({ success: true, repaired });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Repair failed";
    console.error("[repair-arrange-sales]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
