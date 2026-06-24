import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { requireAdminFromRequest } from "../../lib/admin-request";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const user = await requireAdminFromRequest(req);
    
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }
    
    const db = getAdminDb();
    const email = user.email;
    
    // Get inbox unread count (optimized count query)
    const inboxSnap = await db.collection("messages")
      .where("participants", "array-contains", email)
      .where("read", "==", false)
      .where("receiver", "==", email)
      .count()
      .get();
    
    const inboxUnread = inboxSnap.data().count;
    const inboxReadTime = Date.now() - startTime;
    
    // Get activity unread count (optimized count query)
    const activitySnap = await db.collection("notifications")
      .where("targetEmail", "==", email)
      .where("read", "==", false)
      .where("type", "not-in", ["message", "offer"])
      .count()
      .get();
    
    const activityUnread = activitySnap.data().count;
    const totalTime = Date.now() - startTime;
    
    // Log metrics if feature flag enabled
    if (process.env.NEXT_PUBLIC_ENABLE_METRICS === "true") {
      console.log("[unread-counts-metrics]", {
        userId: user.uid,
        inboxUnread,
        activityUnread,
        readTimeMs: totalTime,
        inboxReadTimeMs: inboxReadTime,
        activityReadTimeMs: totalTime - inboxReadTime,
      });
    }
    
    return NextResponse.json({
      inboxUnread,
      activityUnread,
      metrics: process.env.NEXT_PUBLIC_ENABLE_METRICS === "true" ? {
        readTimeMs: totalTime,
      } : undefined,
    });
  } catch (e) {
    console.error("[unread-counts]", e);
    return NextResponse.json({ error: "Failed to fetch unread counts" }, { status: 500 });
  }
}
