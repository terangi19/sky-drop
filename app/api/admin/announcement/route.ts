import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-check";

const SUPER_ADMIN_EMAILS = ["rangitr16@gmail.com"];

function isSuperAdmin(email?: string): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    if (!isSuperAdmin(token.email)) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    if (!isAdminEmail(token.email)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { message, type } = await req.json();
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

    const db = getAdminDb();
    const doc = await db.collection("config").doc("announcement").get();
    const existing = doc.exists ? doc.data() : {};

    // If same message already active, dismiss it
    if (existing.message === message && existing.active) {
      await db.collection("config").doc("announcement").update({ active: false, dismissedAt: new Date() });
      return NextResponse.json({ success: true, status: "dismissed" });
    }

    await db.collection("config").doc("announcement").set({
      message, type: type || "info", active: true,
      createdAt: new Date(), createdBy: token.email,
    });

    // Audit log
    await db.collection("adminAuditLog").add({
      adminUid: token.uid, adminEmail: token.email,
      action: "send_announcement", detail: message,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, status: "active" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
