import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { rateLimit } from "../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`self-approve-kyc:${ip}`, 3, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const decoded = await requireAdminFromRequest(req);

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();

    // Write to kycSubmissions for audit trail
    await db.collection("kycSubmissions").doc(decoded.uid).set({
      uid: decoded.uid,
      email: decoded.email || "",
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: "self-service",
    }, { merge: true });

    await db.collection("profiles").doc(decoded.uid).set({
      kycStatus: "approved",
      kycReviewedAt: new Date(),
      kycReviewedBy: "self-service",
    }, { merge: true });

    return NextResponse.json({ success: true, email: decoded.email });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[self-approve-kyc] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
