import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { isPhoneBlacklisted } from "../../lib/ban-store";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`check-phone-ban:${ip}`, 20, 60_000);
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }
    const blacklisted = await isPhoneBlacklisted(phone);
    return NextResponse.json({ blacklisted });
  } catch {
    return NextResponse.json({ error: "Failed to check phone" }, { status: 500 });
  }
}
