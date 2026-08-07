import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

/**
 * Authenticated unread counts for the signed-in user (not admin-only).
 * Navbar currently uses Firestore snapshots; this route is the server-side poll path.
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
    const { allowed } = await rateLimit(`unread-counts:${ip}`, 60, 60_000);
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

    const inboxSnap = await db
      .collection("messages")
      .where("participants", "array-contains", email)
      .where("read", "==", false)
      .where("receiver", "==", email)
      .count()
      .get();

    const inboxUnread = inboxSnap.data().count;
    const inboxReadTime = Date.now() - startTime;

    const activitySnap = await db
      .collection("notifications")
      .where("targetEmail", "==", email)
      .where("read", "==", false)
      .where("type", "not-in", ["message", "offer"])
      .count()
      .get();

    const activityUnread = activitySnap.data().count;
    const totalTime = Date.now() - startTime;

    if (process.env.NEXT_PUBLIC_ENABLE_METRICS === "true") {
      console.log("[unread-counts-metrics]", {
        userId: decoded.uid,
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
      metrics:
        process.env.NEXT_PUBLIC_ENABLE_METRICS === "true"
          ? { readTimeMs: totalTime }
          : undefined,
    });
  } catch (e) {
    console.error("[unread-counts]", e);
    return NextResponse.json({ error: "Failed to fetch unread counts" }, { status: 500 });
  }
}
