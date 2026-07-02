import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`feedback:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many feedback submissions" }, { status: 429 });
    }

    const body = await req.json();
    const {
      type,
      message,
      page,
      listingId,
      screenshot,
      browser,
      device,
      screen,
      appVersion,
    } = body;

    if (!type || !message) {
      return NextResponse.json({ error: "Type and message are required" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization");
    let userId = null;
    let email = null;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = await verifyIdToken(authHeader.slice(7));
        userId = token.uid;
        email = token.email;
      } catch {
        // User not authenticated, continue without user info
      }
    }

    const db = getAdminDb();
    const feedbackRef = db.collection("feedback").doc();

    await feedbackRef.set({
      type,
      message,
      page: page || null,
      listingId: listingId || null,
      screenshot: screenshot || null,
      browser: browser || null,
      device: device || null,
      screen: screen || null,
      appVersion: appVersion || null,
      userId,
      email,
      status: "new",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[feedback] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to submit feedback" }, { status: 500 });
  }
}
