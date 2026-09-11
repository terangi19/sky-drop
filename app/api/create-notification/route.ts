import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { RATE_LIMITS } from "../../lib/rate-limit-config";
import { isAdminEmail } from "../../lib/admin-check";
import { parseIpFromRequest } from "../../lib/geo-check";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { assertNotificationAllowed } from "../../lib/notification-policy";
import { profileAllowsNotificationDelivery } from "../../lib/notification-prefs";
import {
  applyDecisionDelay,
  decide,
  persistRiskFlag,
  recordTurnstileAttempt,
} from "../../lib/abuse-decision-engine";
import { registerAction } from "../../lib/account-graph";
import { isTurnstileConfigured, verifyTurnstileToken } from "../../lib/turnstile";
import { isPublicHttpUrl } from "../../lib/http-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const ipRule = RATE_LIMITS.createNotification;
    const { allowed } = await rateLimit(`create-notification:${ip}`, ipRule.max, ipRule.windowMs);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const senderEmail = decoded.email?.toLowerCase();
    if (!senderEmail) {
      return NextResponse.json({ error: "Could not determine sender email" }, { status: 400 });
    }

    const { allowed: uidAllowed } = await rateLimit(
      `create-notification:uid:${decoded.uid}`,
      ipRule.max,
      ipRule.windowMs
    );
    if (!uidAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json();
    const {
      targetEmail,
      fromEmail,
      type,
      title,
      message,
      listingId,
      listingTitle,
      listingImage,
      total,
      purchaseId,
      turnstileToken,
    } = body;

    if (
      typeof targetEmail !== "string" ||
      typeof fromEmail !== "string" ||
      typeof type !== "string" ||
      typeof title !== "string" ||
      typeof message !== "string"
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const target = targetEmail.trim().toLowerCase();
    const from = fromEmail.trim().toLowerCase();

    if (!EMAIL_RE.test(target) || !EMAIL_RE.test(from)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (target === senderEmail) {
      return NextResponse.json({ error: "Cannot notify yourself" }, { status: 400 });
    }

    const isAdmin = isAdminEmail(senderEmail);
    if (from !== senderEmail && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { allowed: pairAllowed } = await rateLimit(
      `create-notification:pair:${decoded.uid}:${target}`,
      8,
      60 * 60 * 1000
    );
    if (!pairAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const decision = await decide({
      uid: decoded.uid,
      ip,
      email: senderEmail,
      action: "message",
      contentHash: `${type}:${target}:${message}`.toLowerCase().slice(0, 100),
      accountAgeSec: decoded.auth_time
        ? Math.floor(Date.now() / 1000 - decoded.auth_time)
        : undefined,
    });
    await applyDecisionDelay(decision);

    if (decision.captchaRequired && isTurnstileConfigured()) {
      const token = typeof turnstileToken === "string" ? turnstileToken : "";
      if (!token || !(await verifyTurnstileToken(token))) {
        recordTurnstileAttempt(decoded.uid, false);
        return NextResponse.json(
          { error: "Security check required", captchaRequired: true },
          { status: 403 }
        );
      }
      recordTurnstileAttempt(decoded.uid, true);
    }

    if (decision.verdict === "block") {
      await persistRiskFlag(decoded.uid, `notification_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Action could not be completed" }, { status: 403 });
    }

    if (decision.verdict === "shadow_degrade") {
      registerAction(decoded.uid, ip, `${type}:${target}`);
      return NextResponse.json({ success: true, id: "ok" });
    }

    const db = getAdminDb();
    const policy = await assertNotificationAllowed(db, {
      senderEmail,
      targetEmail: target,
      fromEmail: from,
      type,
      listingId: typeof listingId === "string" ? listingId : null,
      purchaseId: typeof purchaseId === "string" ? purchaseId : null,
    });
    if (policy.ok === false) {
      return NextResponse.json({ error: policy.reason }, { status: 403 });
    }

    const safeListingImage =
      typeof listingImage === "string" && isPublicHttpUrl(listingImage) ? listingImage : null;

    // Honour recipient notification preferences (profiles/* from save-profile)
    try {
      const prefSnap = await db
        .collection("profiles")
        .where("email", "==", target)
        .limit(1)
        .get();
      if (!prefSnap.empty) {
        const prefs = prefSnap.docs[0].data();
        if (!profileAllowsNotificationDelivery(prefs, type)) {
          return NextResponse.json({ success: true, skipped: true, reason: "prefs" });
        }
      }
    } catch (prefErr) {
      console.error("[create-notification] pref check failed (fail-open):", prefErr);
    }

    const ref = await db.collection("notifications").add({
      type: type.slice(0, 64),
      targetEmail: target,
      fromEmail: from,
      title: title.slice(0, 200),
      message: message.slice(0, 2000),
      listingId: typeof listingId === "string" ? listingId : null,
      listingTitle: typeof listingTitle === "string" ? listingTitle.slice(0, 200) : null,
      listingImage: safeListingImage,
      total: typeof total === "number" && Number.isFinite(total) ? total : null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: unknown) {
    console.error("[create-notification] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
