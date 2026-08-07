import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

/**
 * Authenticated notification dropdown payload for the signed-in user (not admin-only).
 * Queries are intentionally simple (no composite not-in + orderBy) so missing indexes
 * cannot 500 the navbar; filtering/sorting happens in memory.
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
      .where("receiver", "==", email)
      .where("read", "==", false)
      .limit(20)
      .get();

    const messagesReadTime = Date.now() - startTime;
    type NotifRow = { id: string; createdAt?: unknown; type?: unknown; [key: string]: unknown };

    const messages: NotifRow[] = messagesSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) } as NotifRow))
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
      .slice(0, 5);

    const notificationsSnap = await db
      .collection("notifications")
      .where("targetEmail", "==", email)
      .where("read", "==", false)
      .limit(20)
      .get();

    const notificationsReadTime = Date.now() - startTime - messagesReadTime;
    const notifications: NotifRow[] = notificationsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as object) } as NotifRow))
      .filter((n) => {
        const type = String(n.type || "");
        return type !== "message" && type !== "offer";
      })
      .sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt))
      .slice(0, 5);

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

function createdAtMs(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return 0;
}
