import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-check";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let adminToken;
    try {
      adminToken = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!isAdminEmail(adminToken.email)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    const { conversationId, reason } = await req.json();
    if (!conversationId || !reason) {
      return NextResponse.json({ error: "conversationId and reason required" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("adminAuditLog").add({
      adminUid: adminToken.uid,
      adminEmail: adminToken.email,
      conversationId,
      reason,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[audit-conversation] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to log audit" }, { status: 500 });
  }
}
