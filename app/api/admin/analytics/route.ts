import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number) {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const db = getAdminDb();
    const days = lastNDays(30);
    const start = new Date();
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    const [profilesSnap, listingsSnap, purchasesSnap] = await Promise.all([
      db.collection("profiles").where("createdAt", ">=", start).get(),
      db.collection("listings").where("createdAt", ">=", start).get(),
      db.collection("purchases").where("createdAt", ">=", start).get(),
    ]);

    const userGrowth: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const listingsGrowth: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const dailySales: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
    const categoryPerf: Record<string, number> = {};

    profilesSnap.docs.forEach((d) => {
      const k = dayKey(new Date(serializeTimestamp(d.data().createdAt) || Date.now()));
      if (userGrowth[k] !== undefined) userGrowth[k]++;
    });

    listingsSnap.docs.forEach((d) => {
      const data = d.data();
      const k = dayKey(new Date(serializeTimestamp(data.createdAt) || Date.now()));
      if (listingsGrowth[k] !== undefined) listingsGrowth[k]++;
      const cat = String(data.category || data.type || "Other");
      categoryPerf[cat] = (categoryPerf[cat] || 0) + 1;
    });

    purchasesSnap.docs.forEach((d) => {
      const k = dayKey(new Date(serializeTimestamp(d.data().createdAt) || Date.now()));
      if (dailySales[k] !== undefined) dailySales[k]++;
    });

    const topCategories = Object.entries(categoryPerf)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      userGrowth: days.map((d) => ({ date: d, count: userGrowth[d] })),
      listingsGrowth: days.map((d) => ({ date: d, count: listingsGrowth[d] })),
      dailyListings: days.map((d) => ({ date: d, count: listingsGrowth[d] })),
      dailySales: days.map((d) => ({ date: d, count: dailySales[d] })),
      categoryPerformance: topCategories,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/analytics]", e);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
