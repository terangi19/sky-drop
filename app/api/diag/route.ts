import { NextResponse } from "next/server";
import { isAdminInitialized, getAdminDb } from "../../lib/firebase-admin";

export async function GET() {
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
    nodeEnv: process.env.NODE_ENV,
    isAdminInitialized: adminInit,
    adminDbWorks: adminDbOk,
    adminError,
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    serviceAccountLength: process.env.FIREBASE_SERVICE_ACCOUNT?.length || 0,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_KEY,
    serviceAccountPreview: process.env.FIREBASE_SERVICE_ACCOUNT
      ? process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 40) + "..."
      : "not set",
  });
}
