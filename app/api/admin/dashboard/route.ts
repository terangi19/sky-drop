import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";
import { enrichReports } from "../../../lib/enrich-reports.server";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function weekRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();
    const { start: tdStart, end: tdEnd } = todayRange();
    const { start: wkStart } = weekRange();

    const [
      reportsSnap,
      openDisputesSnap,
      allDisputesSnap,
      flaggedSnap,
      pendingKycSnap,
      digitalSnap,
      usersOnlineSnap,
      newUsersTodaySnap,
      listingsTodaySnap,
      messagesTodaySnap,
      totalUsersSnap,
      newUsersWeekSnap,
      returningSnap,
      referralsSnap,
      totalMessagesSnap,
      notificationsSnap,
      profilesRecentSnap,
      listingsRecentSnap,
      purchasesRecentSnap,
      matchmakingSnap,
      activeListingsSnap,
      totalSalesSnap,
    ] = await Promise.all([
      db.collection("reports").orderBy("createdAt", "desc").limit(100).get(),
      db.collection("disputes").where("status", "in", ["open", "under_review"]).get(),
      db.collection("disputes").orderBy("createdAt", "desc").limit(20).get(),
      db.collection("listings").where("flagged", "==", true).get(),
      db.collection("kycSubmissions").where("status", "==", "pending").get(),
      db.collection("tradePosts").where("type", "==", "digital").get(),
      db.collection("profiles").where("lastActive", ">=", tdStart).where("lastActive", "<=", tdEnd).get(),
      db.collection("profiles").where("createdAt", ">=", tdStart).where("createdAt", "<=", tdEnd).get(),
      db.collection("listings").where("createdAt", ">=", tdStart).where("createdAt", "<=", tdEnd).get(),
      db.collection("messages").where("createdAt", ">=", tdStart).where("createdAt", "<=", tdEnd).get(),
      db.collection("profiles").get(),
      db.collection("profiles").where("createdAt", ">=", wkStart).get(),
      db.collection("profiles").where("lastActive", ">=", wkStart).get(),
      db.collection("referralEvents").where("createdAt", ">=", tdStart).get(),
      db.collection("messages").get(),
      db.collection("notifications").where("createdAt", ">=", tdStart).where("createdAt", "<=", tdEnd).get(),
      db.collection("profiles").orderBy("createdAt", "desc").limit(3).get(),
      db.collection("listings").orderBy("createdAt", "desc").limit(4).get(),
      db.collection("purchases").orderBy("createdAt", "desc").limit(3).get(),
      db.collection("matchmakingLogs").where("createdAt", ">=", tdStart).where("createdAt", "<=", tdEnd).get().catch(() => null),
      db.collection("listings").where("status", "==", "live").count().get(),
      db.collection("purchases").count().get(),
    ]);

    const reports = await enrichReports(reportsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
    const pendingReports = reports.filter((r) => !r.status || r.status === "pending").length;
    const convReports = reports.filter((r) => r.listingId);

    const listingsToday = listingsTodaySnap.docs.map((d) => d.data());
    const digitalPending = digitalSnap.docs.filter((d) => d.data().status === "pending_review").length;

    const activityFeed: Array<{
      id: string;
      label: string;
      detail: string;
      ts: number;
      icon: string;
    }> = [];

    profilesRecentSnap.docs.forEach((d) => {
      const x = d.data();
      activityFeed.push({
        id: `u-${d.id}`,
        label: "New user signed up",
        detail: x.email || "",
        ts: serializeTimestamp(x.createdAt) || 0,
        icon: "👤",
      });
    });
    listingsRecentSnap.docs.forEach((d) => {
      const x = d.data();
      activityFeed.push({
        id: `l-${d.id}`,
        label: x.type === "wanted" ? "Wanted request posted" : "New listing posted",
        detail: x.title || "",
        ts: serializeTimestamp(x.createdAt) || 0,
        icon: x.type === "wanted" ? "📋" : "📦",
      });
    });
    purchasesRecentSnap.docs.forEach((d) => {
      const x = d.data();
      activityFeed.push({
        id: `p-${d.id}`,
        label: "Listing sold",
        detail: x.listingTitle || "",
        ts: serializeTimestamp(x.createdAt) || 0,
        icon: "💰",
      });
    });
    reports.slice(0, 3).forEach((r) => {
      activityFeed.push({
        id: `r-${r.id}`,
        label: "Report opened",
        detail: `${r.reason || ""} — ${r.reportedUserEmail || ""}`,
        ts: r.createdAtMs || 0,
        icon: "🚨",
      });
    });
    const convDisputes = allDisputesSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAtMs: serializeTimestamp(d.data().createdAt),
    }));

    allDisputesSnap.docs.slice(0, 5).forEach((d) => {
      const x = d.data();
      activityFeed.push({
        id: `d-${d.id}`,
        label: "Dispute opened",
        detail: x.listingTitle || x.purchaseId || "",
        ts: serializeTimestamp(x.createdAt) || 0,
        icon: "⚖️",
      });
    });

    try {
      const auditSnap = await db.collection("adminAuditLog").orderBy("timestamp", "desc").limit(5).get();
      auditSnap.docs.forEach((d) => {
        const x = d.data();
        activityFeed.push({
          id: `a-${d.id}`,
          label: "Admin action",
          detail: `${x.action || ""} — ${x.actorEmail || x.adminEmail || ""}`,
          ts: serializeTimestamp(x.timestamp) || serializeTimestamp(x.createdAt) || 0,
          icon: "🛡️",
        });
      });
    } catch { /* optional */ }

    activityFeed.sort((a, b) => b.ts - a.ts);

    return NextResponse.json({
      reports,
      pendingReports,
      activeListings: activeListingsSnap.data().count,
      totalSales: totalSalesSnap.data().count,
      convReports,
      convDisputes,
      openDisputes: openDisputesSnap.size,
      flaggedListings: flaggedSnap.size,
      pendingVerifications: pendingKycSnap.size,
      pendingDigital: digitalPending,
      usersOnline: usersOnlineSnap.size,
      newUsersToday: newUsersTodaySnap.size,
      listingsToday: listingsToday.filter((d) => d.type !== "wanted").length,
      wantedToday: listingsToday.filter((d) => d.type === "wanted").length,
      messagesToday: messagesTodaySnap.size,
      matchesToday: matchmakingSnap?.size ?? 0,
      totalUsers: totalUsersSnap.size,
      newUsersWeek: newUsersWeekSnap.size,
      returningUsers: returningSnap.size,
      referralSignups: referralsSnap.size,
      totalMessages: totalMessagesSnap.size,
      notificationsSent: notificationsSnap.size,
      matchmakingEvents: matchmakingSnap?.size ?? 0,
      activityFeed: activityFeed.slice(0, 20),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/dashboard]", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
