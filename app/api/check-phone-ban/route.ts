import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isPhoneBlacklisted } from "../../lib/ban-store";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`check-phone-ban:${ip}`, 30, 60_000);
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ blacklisted: false });
    }
    try { await verifyIdToken(authHeader.slice(7)); } catch {
      return NextResponse.json({ blacklisted: false });
    }

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }
    const blacklisted = await isPhoneBlacklisted(phone);
    return NextResponse.json({ blacklisted });
  } catch {
    return NextResponse.json({ blacklisted: false });
  }
}
