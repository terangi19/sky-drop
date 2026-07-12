import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import {
  hiddenConversationDocId,
  type HiddenConversationRecord,
} from "../../lib/conversation-hide";

type HideTarget = {
  otherEmail: string;
  listingId?: string | null;
  conversationId?: string | null;
};

function normalizeTarget(raw: unknown): HideTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const otherEmail =
    typeof item.otherEmail === "string" ? item.otherEmail.trim().toLowerCase() : "";
  if (!otherEmail || !otherEmail.includes("@")) return null;
  const listingId =
    typeof item.listingId === "string" && item.listingId.trim()
      ? item.listingId.trim()
      : null;
  const conversationId =
    typeof item.conversationId === "string" && item.conversationId.trim()
      ? item.conversationId.trim()
      : null;
  return { otherEmail, listingId, conversationId };
}

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`hide-conversation:${ip}`, 20, 60_000);
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

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const rawTargets = Array.isArray(body.conversations) ? body.conversations : [];
    const single = normalizeTarget(body);
    const targets: HideTarget[] = single ? [single] : [];

    for (const raw of rawTargets.slice(0, 100)) {
      const target = normalizeTarget(raw);
      if (target) targets.push(target);
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: "No conversations to hide" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    const hidden: HiddenConversationRecord[] = [];

    for (const target of targets) {
      if (target.otherEmail === userEmail) continue;
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
          listingId: target.listingId || null,
          conversationId: target.conversationId || null,
          hiddenAt: now,
          hiddenAtMs: Date.now(),
          updatedAt: now,
        },
        { merge: true }
      );
      hidden.push({
        otherEmail: target.otherEmail,
        listingId: target.listingId || null,
        conversationId: target.conversationId || null,
        hiddenAtMs: Date.now(),
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, hidden: hidden.length });
  } catch (e) {
    console.error("[hide-conversation]", e);
    return NextResponse.json({ error: "Failed to hide conversation" }, { status: 500 });
  }
}
