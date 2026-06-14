import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { isSuperAdminEmail } from "../../../lib/admin-roles";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();
    const snap = await db.collection("config").doc("features").get();
    const features = snap.exists ? snap.data() : {};
    return NextResponse.json({ features });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ features: {} });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    if (!isSuperAdminEmail(admin.email)) {
      return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    }

    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "Key required" }, { status: 400 });

    const db = getAdminDb();
    await db.collection("config").doc("features").set({ [key]: value }, { merge: true });

    // Audit log
    await db.collection("adminAuditLog").add({
      adminUid: admin.uid, adminEmail: admin.email,
      action: "toggle_feature", detail: `${key}: ${value}`,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
