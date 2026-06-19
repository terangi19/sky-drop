import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isAdminEmail } from "../../lib/admin-check";
import { parseIpFromRequest } from "../../lib/geo-check";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { assertNotificationAllowed } from "../../lib/notification-policy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`create-notification:${ip}`, 30, 60_000);
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

    const ref = await db.collection("notifications").add({
      type: type.slice(0, 64),
      targetEmail: target,
      fromEmail: from,
      title: title.slice(0, 200),
      message: message.slice(0, 2000),
      listingId: typeof listingId === "string" ? listingId : null,
      listingTitle: typeof listingTitle === "string" ? listingTitle.slice(0, 200) : null,
      listingImage: typeof listingImage === "string" ? listingImage : null,
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
