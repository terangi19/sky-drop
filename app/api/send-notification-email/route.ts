import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { RATE_LIMITS } from "../../lib/rate-limit-config";
import { isAdminEmail } from "../../lib/admin-check";
import { parseIpFromRequest } from "../../lib/geo-check";
import { resolveNotificationEmailBody } from "../../lib/notification-email-body";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const rule = RATE_LIMITS.sendNotifEmail;
    const uidKey = decodedToken.uid || decodedToken.email || "unknown";
    const { allowed: uidAllowed } = await rateLimit(
      `notif-email:uid:${uidKey}`,
      rule.max,
      rule.windowMs
    );
    if (!uidAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const ip = parseIpFromRequest(req.headers);
    const { allowed: ipAllowed } = await rateLimit(`notif-email:ip:${ip}`, 60, 60_000);
    if (!ipAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { to, subject, html, text } = await req.json();
    if (!to || !subject) {
      return NextResponse.json({ error: "Missing to, subject, or html" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    const recipient = String(to).trim().toLowerCase();
    const callerEmail = (decodedToken.email || "").toLowerCase();
    const isAdmin = isAdminEmail(decodedToken.email);
    if (recipient !== callerEmail && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = resolveNotificationEmailBody({ isAdmin, html, text });
    if (!body.ok) {
      return NextResponse.json({ error: body.error }, { status: 400 });
    }

    const { sendEmail } = await import("../../lib/email-transport");
    await sendEmail({ to, subject, html: body.html });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[send-notification-email] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
