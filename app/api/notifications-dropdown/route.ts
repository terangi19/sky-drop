import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

/**
 * Authenticated notification dropdown payload for the signed-in user (not admin-only).
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { allowed } = await rateLimit(`notifications-dropdown:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = decoded.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const db = getAdminDb();

    const messagesSnap = await db
      .collection("messages")
      .where("participants", "array-contains", email)
      .where("read", "==", false)
      .where("receiver", "==", email)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const messagesReadTime = Date.now() - startTime;
    const messages = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const notificationsSnap = await db
      .collection("notifications")
      .where("targetEmail", "==", email)
      .where("read", "==", false)
      .where("type", "not-in", ["message", "offer"])
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const notificationsReadTime = Date.now() - startTime - messagesReadTime;
    const notifications = notificationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const totalTime = Date.now() - startTime;

    if (process.env.NEXT_PUBLIC_ENABLE_METRICS === "true") {
      console.log("[notifications-dropdown-metrics]", {
        userId: decoded.uid,
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
      metrics:
        process.env.NEXT_PUBLIC_ENABLE_METRICS === "true"
          ? { readTimeMs: totalTime }
          : undefined,
    });
  } catch (e) {
    console.error("[notifications-dropdown]", e);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
