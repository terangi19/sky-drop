import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";

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

    const userEmail = decoded.email?.trim();
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
    let marked = 0;
    let failed = 0;

    // Delete in batches of 30 (Firestore batch limit for individual doc deletes)
    for (let i = 0; i < messageIds.length; i += 30) {
      const batch = db.batch();
      const batchIds = messageIds.slice(i, i + 30);
      let hasValid = false;

      for (const messageId of batchIds) {
        try {
          const ref = db.collection("messages").doc(messageId);
          const snap = await ref.get();
          if (!snap.exists) {
            marked += 1;
            continue;
          }
          const data = snap.data() || {};
          const participants = Array.isArray(data.participants) ? data.participants : [];
          if (!participants.includes(userEmail)) {
            failed += 1;
            continue;
          }
          batch.delete(ref);
          hasValid = true;
          marked += 1;
        } catch {
          failed += 1;
        }
      }

      if (hasValid) {
        await batch.commit();
      }
    }

    return NextResponse.json({ marked, failed });
  } catch (e) {
    console.error("[delete-messages]", e);
    return NextResponse.json({ error: "Failed to delete messages" }, { status: 500 });
  }
}
