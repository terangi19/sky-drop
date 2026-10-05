import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { blockedEmailsFromDocs } from "../../lib/messages-unread";
import { rateLimit } from "../../lib/rate-limit";

/**
 * Authenticated unread counts for the signed-in user (not admin-only).
 * Navbar polls this instead of holding messages/notifications onSnapshot listeners.
 * Uses simple equality queries (no not-in/orderBy composites) to avoid index 500s.
 * Blocked senders are excluded from the inbox badge without a full messages fan-out.
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

    const [inboxCountSnap, activitySnap] = await Promise.all([
      db
        .collection("messages")
        .where("receiver", "==", email)
        .where("read", "==", false)
        .count()
        .get(),
      db
        .collection("notifications")
        .where("targetEmail", "==", email)
        .where("read", "==", false)
        .limit(50)
        .get(),
    ]);

    let inboxUnread = inboxCountSnap.data().count;

    // The blocked list is only needed to discount unread inbox rows from blocked
    // senders, so skip it (up to 100 reads per poll) when there is nothing unread.
    if (inboxUnread > 0) {
      const blockedSnap = await db
        .collection("users")
        .doc(decoded.uid)
        .collection("blocked")
        .limit(100)
        .get();
      const blockedEmails = new Set(blockedEmailsFromDocs(blockedSnap.docs));

      if (blockedEmails.size > 0) {
        const inboxSnap = await db
          .collection("messages")
          .where("receiver", "==", email)
          .where("read", "==", false)
          .limit(100)
          .get();
        inboxUnread = inboxSnap.docs.filter((d) => {
          const sender = String(d.data()?.sender || "").trim().toLowerCase();
          return !!sender && !blockedEmails.has(sender);
        }).length;
      }
    }

    const inboxReadTime = Date.now() - startTime;

    const activityUnread = activitySnap.docs.filter((d) => {
      const type = String(d.data()?.type || "");
      return type !== "message" && type !== "offer";
    }).length;
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
