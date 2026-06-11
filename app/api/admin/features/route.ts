import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-check";

const SUPER_ADMIN_EMAILS = ["rangitr16@gmail.com"];

function isSuperAdmin(email?: string): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("config").doc("features").get();
    const features = snap.exists ? snap.data() : {};
    return NextResponse.json({ features });
  } catch {
    return NextResponse.json({ features: {} });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    if (!isSuperAdmin(token.email)) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    if (!isAdminEmail(token.email)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

    const db = getAdminDb();
    await db.collection("config").doc("features").set({ [key]: value }, { merge: true });

    // Audit log
    await db.collection("adminAuditLog").add({
      adminUid: token.uid, adminEmail: token.email,
      action: "toggle_feature", detail: `${key}: ${value}`,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
