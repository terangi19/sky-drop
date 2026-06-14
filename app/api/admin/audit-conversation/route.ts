import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);

    const { conversationId, reason } = await req.json();
    if (!conversationId || !reason) {
      return NextResponse.json({ error: "conversationId and reason required" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("adminAuditLog").add({
      adminUid: admin.uid,
      adminEmail: admin.email,
      conversationId,
      reason,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[audit-conversation] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to log audit" }, { status: 500 });
  }
}
