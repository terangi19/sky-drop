import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-check";
import { rateLimit } from "../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`kyc-alert:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const decoded = await verifyIdToken(authHeader.slice(7));
    if (!decoded.uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { uid, email, username } = await req.json();
    if (typeof uid !== "string" || typeof email !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const now = new Date();

    // Write admin alert
    await db.collection("adminNotifications").add({
      type: "kyc_submitted",
      title: "New KYC Submission",
      message: `${email || "Unknown"} (@${username || "—"}) submitted ID documents for verification.`,
      metadata: { uid, email, username },
      read: false,
      createdAt: now,
    });

    // Also write to admin's notifications collection for in-app display
    const adminEmails = (process.env.ADMIN_EMAILS || "rangitr16@gmail.com").split(",").map(e => e.trim());
    for (const adminEmail of adminEmails) {
      await db.collection("notifications").add({
        type: "kyc_submitted",
        targetEmail: adminEmail,
        fromEmail: "system",
        title: "New KYC Submission",
        message: `${email || "Unknown"} submitted ID documents.`,
        metadata: { uid, email, username },
        read: false,
        createdAt: now,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[kyc-alert] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
