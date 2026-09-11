import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";
import { releaseVerifiedPhoneForUser } from "../../lib/phone-registry.server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`clear-phone:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    await releaseVerifiedPhoneForUser(decoded.uid);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[clear-verified-phone]", e);
    return NextResponse.json({ error: "Failed to remove phone" }, { status: 500 });
  }
}
