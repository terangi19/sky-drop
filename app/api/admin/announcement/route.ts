import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { isSuperAdminEmail } from "../../../lib/admin-roles";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (!isSuperAdminEmail(admin.email)) {
      return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    }

    const { message, type } = await req.json();
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection("config").doc("announcement").get();
    const existing: { message?: string; active?: boolean } = doc.exists ? doc.data() ?? {} : {};

    // If same message already active, dismiss it
    if (existing.message === message && existing.active) {
      await db.collection("config").doc("announcement").update({ active: false, dismissedAt: new Date() });
      return NextResponse.json({ success: true, status: "dismissed" });
    }

    await db.collection("config").doc("announcement").set({
      message, type: type || "info", active: true,
      createdAt: new Date(), createdBy: admin.email,
    });

    // Audit log
    await db.collection("adminAuditLog").add({
      adminUid: admin.uid, adminEmail: admin.email,
      action: "send_announcement", detail: message,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, status: "active" });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
