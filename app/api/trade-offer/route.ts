import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { enforceProtection } from "../../lib/enforce-protection";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { createSystemNotification } from "../../lib/system-notifications";
import {
  TRADE_OFFER_LIMITS,
  buildTradeOfferNotification,
  decideTradeOffer,
  parseTradeOfferBody,
  type TradeOfferFailure,
} from "../../lib/trade-offer-validation";

function failure(f: TradeOfferFailure) {
  return NextResponse.json({ error: f.error, code: f.code }, { status: f.status });
}

/**
 * POST /api/trade-offer  { postId, requestId? }
 *
 * Buyers cannot write tradePosts from the client (firestore.rules only lets the owner update),
 * so the offer counter + seller notification are done here with the Admin SDK.
 * Nothing about the seller, title or counter value is trusted from the client.
 */
export async function POST(req: NextRequest) {
  try {
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

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
    const buyerEmail = (decoded.email || "").trim().toLowerCase();
    if (!buyerEmail) {
      return NextResponse.json({ error: "Email required", code: "buyer_identity_missing" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = parseTradeOfferBody(body);
    if (parsed.ok === false) return failure(parsed);
    const { postId, requestId } = parsed;

    // Per-user limits (overall, then per post). Shared helper: Upstash, in-memory fallback.
    const userLimit = TRADE_OFFER_LIMITS.perUser;
    const { allowed: userAllowed } = await rateLimit(
      `trade-offer:uid:${decoded.uid}`,
      userLimit.max,
      userLimit.windowMs
    );
    if (!userAllowed) {
      return NextResponse.json({ error: "Too many requests", code: "rate_limited" }, { status: 429 });
    }
    const postLimit = TRADE_OFFER_LIMITS.perUserPost;
    const { allowed: postAllowed } = await rateLimit(
      `trade-offer:uid-post:${decoded.uid}:${postId}`,
      postLimit.max,
      postLimit.windowMs
    );
    if (!postAllowed) {
      return NextResponse.json({ error: "Too many requests", code: "rate_limited" }, { status: 429 });
    }

    // Per-IP limit, abuse decision engine, optional Turnstile, requestId idempotency (409 on replay).
    const protection = await enforceProtection(req, {
      action: "offer",
      uid: decoded.uid,
      email: decoded.email,
      ip: parseIpFromRequest(req.headers),
      requestId,
      contentHash: `offer:${postId}`,
      accountAgeSec: decoded.auth_time ? Math.floor(Date.now() / 1000 - decoded.auth_time) : undefined,
    });
    if (protection.blocked) return protection.response!;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    const db = getAdminDb();

    // Buyer profile: restricted accounts cannot send offers; username is used in the notification text.
    let buyerLabel = "";
    try {
      const profile = await db.collection("profiles").doc(decoded.uid).get();
      if (profile.exists) {
        const p = profile.data() || {};
        if (p.restricted === true || p.restricted === "true") {
          return NextResponse.json(
            { error: "Your account is restricted. You cannot send offers.", code: "restricted" },
            { status: 403 }
          );
        }
        buyerLabel = typeof p.username === "string" ? p.username : "";
      }
    } catch (e) {
      console.error("[trade-offer] profile read failed:", e);
      return NextResponse.json({ error: "Please try again", code: "profile_unavailable" }, { status: 503 });
    }

    // Count and notify a buyer once per post per 24h. offerers/* is Admin SDK only.
    const postRef = db.collection("tradePosts").doc(postId);
    const offererRef = postRef.collection("offerers").doc(decoded.uid);
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(postRef);
      const offerer = await tx.get(offererRef);
      const decision = decideTradeOffer(snap.exists ? snap.data() : null, { uid: decoded.uid, email: buyerEmail });
      if (decision.ok === false) return { decision, offers: 0, counted: false };
      const current = Number(snap.data()?.offers);
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      const last = offerer.exists ? offerer.get("lastOfferAt")?.toMillis?.() ?? 0 : 0;
      const counted = !offerer.exists || Date.now() - last > 24 * 60 * 60 * 1000;
      if (counted) tx.update(postRef, { offers: FieldValue.increment(1) });
      tx.set(offererRef, { lastOfferAt: FieldValue.serverTimestamp() }, { merge: true });
      return { decision, offers: base + (counted ? 1 : 0), counted };
    });
    if (outcome.decision.ok === false) return failure(outcome.decision);
    const { decision, offers, counted } = outcome;

    if (!counted) {
      return NextResponse.json({ success: true, offers, notified: true, duplicate: true });
    }

    // Counter is committed; notification is best-effort but reported honestly to the client.
    let notified = true;
    try {
      const note = buildTradeOfferNotification({
        buyerLabel,
        buyerEmail,
        postTitle: decision.title,
      });
      await createSystemNotification({
        targetEmail: decision.sellerEmail,
        fromEmail: buyerEmail,
        type: "offer",
        title: note.title,
        message: note.message,
        listingId: postId,
        listingTitle: decision.title,
        listingImage: decision.image,
      });
    } catch (e) {
      notified = false;
      console.error("[trade-offer] seller notification failed:", e);
    }

    return NextResponse.json({ success: true, offers, notified });
  } catch (e: unknown) {
    console.error("[trade-offer]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to send offer", code: "server_error" }, { status: 500 });
  }
}
