import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { notifyKycSubmittedToAdmins } from "../../lib/admin-alerts";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`kyc-notify:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyIdToken(authHeader.slice(7));
    if (!decoded.uid || !decoded.email) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { uid, email, username } = await req.json();
    if (typeof uid !== "string" || typeof email !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (uid !== decoded.uid || email.toLowerCase() !== decoded.email.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    await notifyKycSubmittedToAdmins({ uid, email, username });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[kyc-notify] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
