import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`mark-messages-read:${ip}`, 40, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

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
      .slice(0, 50);

    const fromEmail =
      typeof body.fromEmail === "string" ? body.fromEmail.trim() : "";
    const listingId =
      typeof body.listingId === "string" ? body.listingId.trim() : "";
    const markNotifications = body.markNotifications === true && !!fromEmail;

    if (messageIds.length === 0 && !markNotifications) {
      return NextResponse.json({ marked: 0, notificationsMarked: 0 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server messaging not configured" }, { status: 503 });
    }

    const db = getAdminDb();
    let marked = 0;
    const failures: string[] = [];

    await Promise.all(
      messageIds.map(async (messageId: string) => {
        try {
          const ref = db.collection("messages").doc(messageId);
          const snap = await ref.get();
          if (!snap.exists) return;

          const data = snap.data() || {};
          const participants = Array.isArray(data.participants)
            ? data.participants
                .filter((participant): participant is string => typeof participant === "string")
                .map((participant) => participant.trim().toLowerCase())
            : [];
          if (!participants.includes(userEmail)) {
            failures.push(messageId);
            return;
          }

          const sender = typeof data.sender === "string" ? data.sender.trim().toLowerCase() : "";
          const receiver = typeof data.receiver === "string" ? data.receiver.trim().toLowerCase() : "";
          if (receiver && receiver !== userEmail) {
            failures.push(messageId);
            return;
          }
          if (!receiver && sender === userEmail) {
            marked += 1;
            return;
          }

          if (data.read === true) {
            marked += 1;
            return;
          }

          await ref.update({
            read: true,
            readAt: FieldValue.serverTimestamp(),
          });
          marked += 1;
          
          // Update conversation-level read status
          const conversationId = data.conversationId;
          if (conversationId && typeof conversationId === "string") {
            try {
              const convRef = db.collection("conversations").doc(conversationId);
              await convRef.set({
                [`lastReadBy.${userEmail}`]: FieldValue.serverTimestamp(),
              }, { merge: true });
            } catch {
              // Conversation update is best-effort
            }
          }
        } catch {
          failures.push(messageId);
        }
      })
    );

    // Consolidate client notification fan-out: mark matching inbox notifications once here
    let notificationsMarked = 0;
    if (markNotifications) {
      try {
        const notifSnap = await db
          .collection("notifications")
          .where("targetEmail", "==", userEmail)
          .orderBy("createdAt", "desc")
          .limit(30)
          .get();

        const updates: Promise<unknown>[] = [];
        for (const d of notifSnap.docs) {
          const data = d.data() || {};
          if (data.read === true) continue;
          const notifFrom = typeof data.fromEmail === "string" ? data.fromEmail : "";
          const type = typeof data.type === "string" ? data.type : "";
          if (type === "message" && notifFrom === fromEmail) {
            updates.push(d.ref.update({ read: true }));
            continue;
          }
          if ((data.listingId || "") !== (listingId || "")) continue;
          if (notifFrom && notifFrom !== fromEmail) continue;
          updates.push(d.ref.update({ read: true }));
        }
        await Promise.all(updates);
        notificationsMarked = updates.length;
      } catch (e) {
        console.error("[mark-messages-read] notifications", e);
      }
    }

    return NextResponse.json({ marked, failed: failures.length, notificationsMarked });
  } catch (e) {
    console.error("[mark-messages-read]", e);
    return NextResponse.json({ error: "Failed to mark messages read" }, { status: 500 });
  }
}
