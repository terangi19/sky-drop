import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../lib/rate-limit";

interface PushPayload {
  targetEmail: string;
  title: string;
  message: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`push:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { targetEmail, title, message, url } = await req.json() as PushPayload;
    if (!targetEmail || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccount) {
        initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
      } else {
        initializeApp({ projectId: "sky-drop-de459" });
      }
    }

    const db = getFirestore();
    const tokensSnap = await db.collection("fcmTokens").get();
    const tokens: string[] = [];

    tokensSnap.forEach((doc) => {
      const data = doc.data();
      if (data.email === targetEmail && data.token) {
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
