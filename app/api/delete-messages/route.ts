import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { hiddenConversationDocId } from "../../lib/conversation-hide";

/** Legacy route — hides conversations per user instead of deleting shared messages. */
export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`delete-messages:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded: { uid: string; email?: string };
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const userEmail = decoded.email?.trim().toLowerCase();
    if (!userEmail) {
      return NextResponse.json({ error: "Could not determine user email" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body.messageIds) ? body.messageIds : [];
    const messageIds = rawIds
      .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0 && !id.startsWith("temp_"))
      .slice(0, 200);

    if (messageIds.length === 0) {
      return NextResponse.json({ marked: 0, failed: 0 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const db = getAdminDb();
    const conversationTargets = new Map<
      string,
      { otherEmail: string; listingId: string | null; conversationId: string | null }
    >();

    for (const messageId of messageIds) {
      try {
        const snap = await db.collection("messages").doc(messageId).get();
        if (!snap.exists) continue;
        const data = snap.data() || {};
        const participants = Array.isArray(data.participants)
          ? data.participants.filter((participant): participant is string => typeof participant === "string")
          : [];
        if (!participants.some((participant) => participant.trim().toLowerCase() === userEmail)) continue;
        const otherEmail = participants.find(
          (participant) => participant.trim().toLowerCase() !== userEmail
        )?.trim();
        if (!otherEmail) continue;
        const listingId =
          typeof data.listingId === "string" && data.listingId ? data.listingId : null;
        const key = `${otherEmail}||${listingId || ""}`;
        if (!conversationTargets.has(key)) {
          conversationTargets.set(key, {
            otherEmail,
            listingId,
            conversationId:
              typeof data.conversationId === "string" ? data.conversationId : null,
          });
        }
      } catch {
        // skip invalid message
      }
    }

    if (conversationTargets.size === 0) {
      return NextResponse.json({ marked: 0, failed: messageIds.length });
    }

    const batch = db.batch();
    const now = new Date();
    for (const target of conversationTargets.values()) {
      const docId = hiddenConversationDocId(target.otherEmail, target.listingId);
      const ref = db
        .collection("profiles")
        .doc(decoded.uid)
        .collection("inboxHidden")
        .doc(docId);
      batch.set(
        ref,
        {
          otherEmail: target.otherEmail,
          listingId: target.listingId,
          conversationId: target.conversationId,
          hiddenAt: now,
          hiddenAtMs: now.getTime(),
          updatedAt: now,
        },
        { merge: true }
      );
    }
    await batch.commit();

    return NextResponse.json({
      marked: conversationTargets.size,
      failed: 0,
      hidden: conversationTargets.size,
    });
  } catch (e) {
    console.error("[delete-messages]", e);
    return NextResponse.json({ error: "Failed to hide messages" }, { status: 500 });
  }
}
