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
    
    // Fetch last 5 unread messages
    const messagesSnap = await db.collection("messages")
      .where("participants", "array-contains", email)
      .where("read", "==", false)
      .where("receiver", "==", email)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    
    const messagesReadTime = Date.now() - startTime;
    const messages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Fetch last 5 unread notifications
    const notificationsSnap = await db.collection("notifications")
      .where("targetEmail", "==", email)
      .where("read", "==", false)
      .where("type", "not-in", ["message", "offer"])
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    
    const notificationsReadTime = Date.now() - startTime - messagesReadTime;
    const notifications = notificationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const totalTime = Date.now() - startTime;
    
    // Log metrics if feature flag enabled
    if (process.env.NEXT_PUBLIC_ENABLE_METRICS === "true") {
      console.log("[notifications-dropdown-metrics]", {
        userId: user.uid,
        messagesCount: messages.length,
        notificationsCount: notifications.length,
        readTimeMs: totalTime,
        messagesReadTimeMs: messagesReadTime,
        notificationsReadTimeMs: notificationsReadTime,
      });
    }
    
    return NextResponse.json({
      notifications: [...messages, ...notifications],
      unreadCount: messages.length + notifications.length,
      metrics: process.env.NEXT_PUBLIC_ENABLE_METRICS === "true" ? {
        readTimeMs: totalTime,
      } : undefined,
    });
  } catch (e) {
    console.error("[notifications-dropdown]", e);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
