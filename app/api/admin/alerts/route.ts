import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();

    const [reportsSnap, disputesSnap, auditSnap] = await Promise.all([
      db.collection("reports").orderBy("createdAt", "desc").limit(30).get(),
      db.collection("disputes").where("status", "in", ["open", "under_review"]).limit(30).get(),
      db.collection("adminAuditLog").orderBy("timestamp", "desc").limit(20).get().catch(() => null),
    ]);

    const alerts: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      ts: number;
      read: boolean;
      href?: string;
    }> = [];

    reportsSnap.docs.forEach((d) => {
      const x = d.data();
      if (x.status && x.status !== "pending") return;
      alerts.push({
        id: `report-${d.id}`,
        type: "new_report",
        title: "New report",
        message: `${x.reason || "Report"} — ${x.reportedUserEmail || "unknown"}`,
        ts: serializeTimestamp(x.createdAt) || 0,
        read: false,
        href: "/manage/reports",
      });
    });

    disputesSnap.docs.forEach((d) => {
      const x = d.data();
      alerts.push({
        id: `dispute-${d.id}`,
        type: "new_dispute",
        title: "Open dispute",
        message: `${x.listingTitle || "Purchase"} — ${x.status}`,
        ts: serializeTimestamp(x.createdAt) || 0,
        read: false,
        href: "/manage/disputes",
      });
    });

    auditSnap?.docs.forEach((d) => {
      const x = d.data();
      const action = String(x.action || "");
      if (!action.includes("ban") && !action.includes("suspend") && !action.includes("failed")) return;
      alerts.push({
        id: `audit-${d.id}`,
        type: "suspicious_activity",
        title: "Admin / security event",
        message: `${action} by ${x.actorEmail || x.adminEmail || "admin"}`,
        ts: serializeTimestamp(x.timestamp) || serializeTimestamp(x.createdAt) || 0,
        read: !!x.read,
        href: "/manage/activity",
      });
    });

    alerts.sort((a, b) => b.ts - a.ts);
    return NextResponse.json({ alerts: alerts.slice(0, 40) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/alerts]", e);
    return NextResponse.json({ error: "Failed to load alerts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const { alertIds } = await req.json().catch(() => ({}));
    if (!Array.isArray(alertIds)) {
      return NextResponse.json({ error: "alertIds required" }, { status: 400 });
    }
    const db = getAdminDb();
    for (const id of alertIds) {
      if (typeof id === "string" && id.startsWith("audit-")) {
        await db.collection("adminAuditLog").doc(id.replace("audit-", "")).set({ read: true }, { merge: true });
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
