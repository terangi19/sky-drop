import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized, getAdminAuth } from "../../lib/firebase-admin";
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
import { clearHiddenConversationForUser } from "../../lib/conversation-hide.server";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    
    // Rate limit: 30 messages per minute per user
    const { allowed } = await rateLimit(`send-message:${ip}`, 25, 60_000);
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
    const createConversation = body.createConversation === true;
    const convKey = typeof body.convKey === "string" ? body.convKey.trim() : "";
    const offerAmount = typeof body.offerAmount === "number" ? body.offerAmount : NaN;
    const offerType = typeof body.offerType === "string" ? body.offerType : "";

    if (!["text", "image", "file", "offer"].includes(msgType)) {
      return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
    }
    if (msgType === "text" && (!text || text.length > 2000)) {
      return NextResponse.json({ error: "Message must be 1\u20132000 characters" }, { status: 400 });
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

    const scamResult = detectScam(text);
    if (scamResult.isScam) {
      return NextResponse.json({ error: "Message flagged as suspicious" }, { status: 400 });
    }

    if (decision.captchaRequired && isTurnstileConfigured()) {
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        recordTurnstileAttempt(decoded.uid, false);
        return NextResponse.json(
          { error: "Security check failed. Please refresh and try again.", captchaRequired: true },
          { status: 403 }
        );
      }
      recordTurnstileAttempt(decoded.uid, true);
    }

    if (decision.verdict === "block") {
      await persistRiskFlag(decoded.uid, `message_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Message could not be sent" }, { status: 403 });
    }

    if (decision.verdict === "shadow_degrade") {
      registerAction(decoded.uid, ip, input.contentHash);
      return NextResponse.json({ success: true, shadowDegraded: true });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const senderEmail = decoded.email || "";
    if (!senderEmail) {
      return NextResponse.json({ error: "Could not determine sender email" }, { status: 400 });
    }

    // Resolve username / uid / email-local-part placeholders to a real email so
    // participants stay deliverable for both buyer and seller inboxes.
    let resolvedReceiver = receiver;
    if (!receiver.includes("@")) {
      const lower = receiver.toLowerCase();
      const unameSnap = await db.collection("usernames").doc(lower).get();
      if (unameSnap.exists) {
        const uid = String(unameSnap.data()?.uid || "");
        if (uid) {
          const profileSnap = await db.collection("profiles").doc(uid).get();
          const email = String(profileSnap.data()?.email || "").trim();
          if (email.includes("@")) resolvedReceiver = email;
        }
      }
      if (!resolvedReceiver.includes("@")) {
        try {
          const userRec = await getAdminAuth().getUser(receiver);
          if (userRec.email) resolvedReceiver = userRec.email;
        } catch {
          /* not a uid */
        }
      }
      if (!resolvedReceiver.includes("@") && listingId) {
        const listingSnap = await db.collection("listings").doc(listingId).get();
        const listing = listingSnap.data() || {};
        const listingEmail = String(listing.sellerEmail || "").trim();
        const listingUser = String(listing.sellerUsername || "").trim().toLowerCase();
        const listingUid = String(listing.sellerId || "").trim();
        if (
          listingEmail.includes("@") &&
          (lower === listingUser ||
            lower === listingUid.toLowerCase() ||
            lower === listingEmail.split("@")[0]?.toLowerCase())
        ) {
          resolvedReceiver = listingEmail;
        }
      }
    }

    if (resolvedReceiver.toLowerCase() === senderEmail.toLowerCase()) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    // Existing conversations: sender must be a participant.
    if (conversationId) {
      const convSnap = await db.collection("conversations").doc(conversationId).get();
      if (!convSnap.exists) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const participants = Array.isArray(convSnap.data()?.participants)
        ? (convSnap.data()!.participants as string[])
        : [];
      if (!participants.includes(senderEmail)) {
        return NextResponse.json({ error: "Not a participant in this conversation" }, { status: 403 });
      }
    }

    const participants = [senderEmail, resolvedReceiver];

    if (createConversation && !conversationId) {
      if (convKey) {
        const existing = await db
          .collection("conversations")
          .where("convKey", "==", convKey)
          .limit(5)
          .get();
        const match = existing.docs.find((d) => {
          const parts = (d.data().participants as string[] | undefined) || [];
          return participants.every((p) => parts.includes(p));
        });
        if (match) {
          conversationId = match.id;
        }
      }
      if (!conversationId && listingId) {
        const byListing = await db
          .collection("conversations")
          .where("listingId", "==", listingId)
          .limit(20)
          .get();
        const match = byListing.docs.find((d) => {
          const parts = (d.data().participants as string[] | undefined) || [];
          return participants.every((p) => parts.includes(p));
        });
        if (match) {
          conversationId = match.id;
        }
      }
      if (!conversationId) {
        const convData: Record<string, unknown> = {
          participants,
          // Conversation identity is derived from the authenticated sender and
          // resolved receiver, never from client-supplied participant fields.
          buyerEmail: senderEmail,
          sellerEmail: resolvedReceiver,
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
    }

    const messageData: Record<string, unknown> = {
      type: msgType,
      text: text || null,
      sender: senderEmail,
      receiver: resolvedReceiver,
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
      // Only a server-side acceptance flow may transition an offer.
      messageData.offerStatus = "pending";
    }

    const msgRef = await db.collection("messages").add(messageData);

    await clearHiddenConversationForUser(
      db,
      receiver,
      senderEmail,
      listingId || null
    ).catch(() => {});

    if (conversationId) {
      try {
        await db.collection("conversations").doc(conversationId).update({
          updatedAt: FieldValue.serverTimestamp(),
          lastMessage: text.slice(0, 100),
        });
      } catch (convError) {
        console.error("[send-message] conversation update failed:", convError);
        // Continue anyway - message was saved successfully
      }
    }

    registerAction(decoded.uid, ip, input.contentHash);

    return NextResponse.json({
      success: true,
      messageId: msgRef.id,
      conversationId: conversationId || undefined,
      delayMs: 0,
    });

  } catch (e: unknown) {
    console.error("[send-message]", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
