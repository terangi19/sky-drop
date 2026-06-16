import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  decide,
  applyDecisionDelay,
  persistRiskFlag,
  recordTurnstileAttempt,
  type DecisionInput,
} from "../../lib/abuse-decision-engine";
import { verifyTurnstileToken, isTurnstileConfigured } from "../../lib/turnstile";
import { registerAction } from "../../lib/account-graph";
import { detectScam } from "../../lib/scamdetection";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const msgType = typeof body.type === "string" ? body.type : "text";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
    const receiver = typeof body.receiver === "string" ? body.receiver.trim() : "";
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const listingTitle = typeof body.listingTitle === "string" ? body.listingTitle.trim() : "";
    const listingImage = typeof body.listingImage === "string" ? body.listingImage : "";
    const listingPrice = typeof body.listingPrice === "string" ? body.listingPrice : "";
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;

    // ── Validate ──

    if (!["text", "image", "file", "offer"].includes(msgType)) {
      return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
    }
    if (msgType === "text" && (!text || text.length > 2000)) {
      return NextResponse.json({ error: "Message must be 1–2000 characters" }, { status: 400 });
    }
    if (!receiver) {
      return NextResponse.json({ error: "Receiver is required" }, { status: 400 });
    }

    // ── Abuse decision engine ──

    const input: DecisionInput = {
      uid: decoded.uid,
      ip,
      email: decoded.email,
      action: "message",
      contentHash: text.toLowerCase().slice(0, 100),
      accountAgeSec: decoded.auth_time ? Math.floor((Date.now() / 1000) - decoded.auth_time) : undefined,
    };

    const decision = await decide(input);
    await applyDecisionDelay(decision);

    // ── Turnstile (probabilistic) ──

    if (decision.captchaRequired && isTurnstileConfigured()) {
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        recordTurnstileAttempt(decoded.uid, false);
        return NextResponse.json({ error: "Security check required", captchaRequired: true }, { status: 403 });
      }
      recordTurnstileAttempt(decoded.uid, true);
    }

    // ── Block ──

    if (decision.verdict === "block") {
      await persistRiskFlag(decoded.uid, `message_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Message could not be sent" }, { status: 403 });
    }

    // ── Scam check ──

    const scamResult = detectScam(text);
    if (scamResult.isScam) {
      return NextResponse.json({ error: "Message flagged as suspicious" }, { status: 400 });
    }

    // ── Shadow degrade: simulate success but don't write ──

    if (decision.verdict === "shadow_degrade") {
      registerAction(decoded.uid, ip, input.contentHash);
      return NextResponse.json({ success: true, shadowDegraded: true });
    }

    // ── Write message via Admin SDK ──

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const participants = [decoded.email, receiver];

    const messageData: Record<string, unknown> = {
      type: msgType,
      text: text || null,
      sender: decoded.email,
      receiver,
      participants,
      conversationId: conversationId || null,
      listingId: listingId || null,
      listingTitle: listingTitle || null,
      listingImage: listingImage || null,
      listingPrice: listingPrice || null,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    };

    if (msgType === "image") messageData.imageUrl = imageUrl;
    if (msgType === "file") {
      messageData.fileUrl = fileUrl;
      messageData.fileName = fileName;
      messageData.fileSize = fileSize;
    }
    if (msgType === "offer") {
      messageData.offerType = body.offerType || null;
      messageData.offerAmount = body.offerAmount || null;
      messageData.offerStatus = body.offerStatus || "pending";
    }

    const msgRef = await db.collection("messages").add(messageData);

    // ── Create or update conversation ──

    if (conversationId) {
      await db.collection("conversations").doc(conversationId).update({
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: text.slice(0, 100),
      });
    }

    // ── Register graph action ──

    registerAction(decoded.uid, ip, input.contentHash);

    return NextResponse.json({
      success: true,
      messageId: msgRef.id,
      delayMs: decision.delayMs,
    });

  } catch (e: unknown) {
    console.error("[send-message]", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
