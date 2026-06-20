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
import { requireVerifiedEmail } from "../../lib/require-verified";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    
    // Rate limit: 30 messages per minute per user
    const { allowed } = await rateLimit(`send-message:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many messages. Please slow down." }, { status: 429 });
    }

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

    const verified = requireVerifiedEmail(decoded, "sending messages");
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
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
    let conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const listingTitle = typeof body.listingTitle === "string" ? body.listingTitle.trim() : "";
    const listingImage = typeof body.listingImage === "string" ? body.listingImage : "";
    const listingPrice = typeof body.listingPrice === "string" ? body.listingPrice : "";
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const requestId = typeof body.requestId === "string" ? body.requestId : undefined;
    const createConversation = body.createConversation === true;
    const convKey = typeof body.convKey === "string" ? body.convKey.trim() : "";
    const buyerEmail = typeof body.buyerEmail === "string" ? body.buyerEmail.trim() : "";
    const sellerEmail = typeof body.sellerEmail === "string" ? body.sellerEmail.trim() : "";
    const offerAmount = typeof body.offerAmount === "number" ? body.offerAmount : NaN;
    const offerType = typeof body.offerType === "string" ? body.offerType : "";
    const offerStatus = typeof body.offerStatus === "string" ? body.offerStatus : "pending";

    if (!["text", "image", "file", "offer", "system"].includes(msgType)) {
      return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
    }
    if (msgType === "text" && (!text || text.length > 2000)) {
      return NextResponse.json({ error: "Message must be 1\u20132000 characters" }, { status: 400 });
    }
    if (msgType === "system") {
      if (!text || text.length > 2000) {
        return NextResponse.json({ error: "System message must be 1\u20132000 characters" }, { status: 400 });
      }
    }
    if (!receiver) {
      return NextResponse.json({ error: "Receiver is required" }, { status: 400 });
    }
    if (msgType === "offer" && (!isFinite(offerAmount) || offerAmount <= 0)) {
      return NextResponse.json({ error: "Offer must include a valid positive amount" }, { status: 400 });
    }

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

    if (decision.captchaRequired && isTurnstileConfigured()) {
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        recordTurnstileAttempt(decoded.uid, false);
        return NextResponse.json({ error: "Security check required", captchaRequired: true }, { status: 403 });
      }
      recordTurnstileAttempt(decoded.uid, true);
    }

    if (decision.verdict === "block") {
      await persistRiskFlag(decoded.uid, `message_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Message could not be sent" }, { status: 403 });
    }

    const scamResult = detectScam(text);
    if (scamResult.isScam) {
      return NextResponse.json({ error: "Message flagged as suspicious" }, { status: 400 });
    }

    if (decision.verdict === "shadow_degrade") {
      registerAction(decoded.uid, ip, input.contentHash);
      return NextResponse.json({ success: true, shadowDegraded: true });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const participants = [decoded.email, receiver];

    if (createConversation && !conversationId) {
      const convData: Record<string, unknown> = {
        participants,
        buyerEmail: buyerEmail || decoded.email,
        sellerEmail: sellerEmail || receiver,
        listingTitle: listingTitle || null,
        listingPrice: listingPrice || null,
        listingImage: listingImage || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: text.slice(0, 100),
      };
      if (convKey) convData.convKey = convKey;
      if (listingId) convData.listingId = listingId;

      const convRef = await db.collection("conversations").add(convData);
      conversationId = convRef.id;
    }

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
      messageData.offerType = offerType || null;
      messageData.offerAmount = offerAmount;
      messageData.offerStatus = offerStatus || "pending";
    }

    const msgRef = await db.collection("messages").add(messageData);

    if (conversationId) {
      try {
        await db.collection("conversations").doc(conversationId).update({
          updatedAt: FieldValue.serverTimestamp(),
          lastMessage: text.slice(0, 100),
        });
      } catch {
        console.warn("[send-message] conversation update failed (conversationId may not exist):", conversationId);
      }
    }

    registerAction(decoded.uid, ip, input.contentHash);

    return NextResponse.json({
      success: true,
      messageId: msgRef.id,
      conversationId: conversationId || undefined,
      delayMs: decision.delayMs,
    });

  } catch (e: unknown) {
    console.error("[send-message]", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
