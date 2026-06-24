import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { requireAdminFromRequest } from "../../../lib/admin-request";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminFromRequest(req);
    
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }
    
    const db = getAdminDb();
    const body = await req.json();
    
    // Store metrics in Firestore
    const metricsRef = db.collection("metrics").doc("navbar-optimization");
    
    await metricsRef.set({
      userId: user.uid,
      timestamp: new Date(),
      ...body,
    }, { merge: true });
    
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[metrics-navbar]", e);
    return NextResponse.json({ error: "Failed to store metrics" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdminFromRequest(req);
    
    // Only admins can view metrics
    if (!user.email || !user.email.includes("admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }
    
    const db = getAdminDb();
    
    // Get aggregated metrics
    const metricsSnap = await db.collection("metrics")
      .where("userId", "==", "navbar-optimization")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    
    const metrics = metricsSnap.docs.map(d => d.data());
    
    return NextResponse.json({ metrics });
  } catch (e) {
    console.error("[metrics-navbar]", e);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
