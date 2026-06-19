import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../../lib/firebase-admin";
import { requireAdminFromRequest } from "../../../lib/admin-request";
import { rateLimit } from "../../../lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`kyc-list:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const decoded = await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    
    // Only fetch pending KYC submissions - image URLs stay in this locked collection
    const snap = await db
      .collection("kycSubmissions")
      .where("status", "==", "pending")
      .orderBy("submittedAt", "desc")
      .get();

    const submissions = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ submissions });
  } catch (e: unknown) {
    console.error("[kyc-list] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to fetch KYC submissions" }, { status: 500 });
  }
}
