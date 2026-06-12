import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`mark-messages-read:${ip}`, 60, 60_000);
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

    const userEmail = decoded.email?.trim();
    if (!userEmail) {
      return NextResponse.json({ error: "Could not determine user email" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body.messageIds) ? body.messageIds : [];
    const messageIds = rawIds
      .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0 && !id.startsWith("temp_"))
      .slice(0, 50);

    if (messageIds.length === 0) {
      return NextResponse.json({ marked: 0 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server messaging not configured" }, { status: 503 });
    }

    const db = getAdminDb();
    let marked = 0;
    const failures: string[] = [];

    await Promise.all(
      messageIds.map(async (messageId) => {
        try {
          const ref = db.collection("messages").doc(messageId);
          const snap = await ref.get();
          if (!snap.exists) return;

          const data = snap.data() || {};
          const participants = Array.isArray(data.participants) ? data.participants : [];
          if (!participants.includes(userEmail)) {
            failures.push(messageId);
            return;
          }

          const sender = typeof data.sender === "string" ? data.sender : "";
          const receiver = typeof data.receiver === "string" ? data.receiver : "";
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
        } catch {
          failures.push(messageId);
        }
      })
    );

    return NextResponse.json({ marked, failed: failures.length });
  } catch (e) {
    console.error("[mark-messages-read]", e);
    return NextResponse.json({ error: "Failed to mark messages read" }, { status: 500 });
  }
}
