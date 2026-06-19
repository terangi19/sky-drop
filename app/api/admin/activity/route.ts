import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100);
    const db = getAdminDb();

    const [profiles, listings, purchases, reports, disputes, audit] = await Promise.all([
      db.collection("profiles").orderBy("createdAt", "desc").limit(15).get(),
      db.collection("listings").orderBy("createdAt", "desc").limit(15).get(),
      db.collection("purchases").orderBy("createdAt", "desc").limit(15).get(),
      db.collection("reports").orderBy("createdAt", "desc").limit(15).get(),
      db.collection("disputes").orderBy("createdAt", "desc").limit(15).get(),
      db.collection("adminAuditLog").orderBy("timestamp", "desc").limit(20).get().catch(() => null),
    ]);

    const events: Array<{ id: string; type: string; label: string; detail: string; ts: number }> = [];

    profiles.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `u-${d.id}`,
        type: "user_joined",
        label: "User joined",
        detail: x.username ? `@${x.username}` : x.email || d.id,
        ts: serializeTimestamp(x.createdAt) || 0,
      });
    });
    listings.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `l-${d.id}`,
        type: "listing_created",
        label: "Listing created",
        detail: x.title || "Untitled",
        ts: serializeTimestamp(x.createdAt) || 0,
      });
    });
    purchases.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `p-${d.id}`,
        type: "listing_sold",
        label: "Listing sold",
        detail: x.listingTitle || x.listingId || "",
        ts: serializeTimestamp(x.createdAt) || 0,
      });
    });
    reports.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `r-${d.id}`,
        type: "report_submitted",
        label: "Report submitted",
        detail: `${x.reason || ""} — ${x.reportedUserEmail || ""}`,
        ts: serializeTimestamp(x.createdAt) || 0,
      });
    });
    disputes.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `d-${d.id}`,
        type: "dispute_opened",
        label: "Dispute opened",
        detail: x.listingTitle || x.purchaseId || "",
        ts: serializeTimestamp(x.createdAt) || 0,
      });
    });
    audit?.docs.forEach((d) => {
      const x = d.data();
      events.push({
        id: `a-${d.id}`,
        type: "admin_action",
        label: "Admin action",
        detail: `${x.action || ""} ${x.actorEmail || ""}`.trim(),
        ts: serializeTimestamp(x.timestamp) || serializeTimestamp(x.createdAt) || 0,
      });
    });

    events.sort((a, b) => b.ts - a.ts);

    return NextResponse.json({ events: events.slice(0, limit) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/activity]", e);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
