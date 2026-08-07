import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { RATE_LIMITS } from "../../lib/rate-limit-config";
import { isAdminEmail } from "../../lib/admin-check";
import { parseIpFromRequest } from "../../lib/geo-check";

interface PushPayload {
  targetEmail: string;
  title: string;
  message: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const rule = RATE_LIMITS.sendPush;
    const uidKey = decoded.uid || decoded.email || "unknown";
    const { allowed: uidAllowed } = await rateLimit(
      `push:uid:${uidKey}`,
      rule.max,
      rule.windowMs
    );
    if (!uidAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const ip = parseIpFromRequest(req.headers);
    const { allowed: ipAllowed } = await rateLimit(`push:ip:${ip}`, 40, 60_000);
    if (!ipAllowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { targetEmail, title, message, url } = (await req.json()) as PushPayload;
    if (!targetEmail || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (targetEmail !== decoded.email && !isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccount) {
        initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
      } else {
        return NextResponse.json({ sent: 0, note: "push not configured" });
      }
    }

    const db = getFirestore();
    const tokensSnap = await db.collection("fcmTokens").where("email", "==", targetEmail).get();
    const tokens: string[] = [];

    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging();

    let sent = 0;
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title, body: message },
          data: { url: url || "/" },
        });
        sent++;
      } catch {}
    }

    return NextResponse.json({ sent });
  } catch (e: any) {
    console.error("send-push error:", e);
    return NextResponse.json({ error: "Failed to send push" }, { status: 500 });
  }
}
