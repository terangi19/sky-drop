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
    // Server-Timing: durations only (ms), never ids or emails.
    const spans: string[] = [];
    const span = (name: string, since: number) => spans.push(`${name};dur=${Date.now() - since}`);
    const timed = (res: NextResponse) => {
      res.headers.set("Server-Timing", [...spans, `total;dur=${Date.now() - startTime}`].join(", "));
      return res;
    };

    let t = Date.now();
    const { allowed } = await rateLimit(`unread-counts:${ip}`, 60, 60_000);
    span("rateLimit", t);
    if (!allowed) {
      return timed(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
    }

    let decoded;
    t = Date.now();
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      span("auth", t);
      return timed(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    span("auth", t);

    const email = decoded.email;
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const db = getAdminDb();

    t = Date.now();
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

    span("counts", t);
    let inboxUnread = inboxCountSnap.data().count;

    // The blocked list is only needed to discount unread inbox rows from blocked
    // senders, so skip it (up to 100 reads per poll) when there is nothing unread.
    if (inboxUnread > 0) {
      t = Date.now();
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
      span("blocked", t);
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

    return timed(NextResponse.json({
      inboxUnread,
      activityUnread,
      metrics:
        process.env.NEXT_PUBLIC_ENABLE_METRICS === "true"
          ? { readTimeMs: totalTime }
          : undefined,
    }));
  } catch (e) {
    console.error("[unread-counts]", e);
    return NextResponse.json({ error: "Failed to fetch unread counts" }, { status: 500 });
  }
}
