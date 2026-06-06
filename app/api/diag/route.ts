import { NextRequest, NextResponse } from "next/server";
import { isAdminInitialized, getAdminDb, verifyIdToken } from "../../lib/firebase-admin";
import { isAdminEmail } from "../../lib/admin-check";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let decodedToken;
  try {
    decodedToken = await verifyIdToken(authHeader.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
  if (!isAdminEmail(decodedToken.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminInit = isAdminInitialized();
  let adminDbOk = false;
  let adminError: string | null = null;
  if (adminInit) {
    try {
      const db = getAdminDb();
      await db.collection("listings").limit(1).get();
      adminDbOk = true;
    } catch (e: unknown) {
      adminError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    isAdminInitialized: adminInit,
    adminDbWorks: adminDbOk,
    adminError,
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_KEY,
  });
}
