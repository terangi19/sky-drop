import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { isDisposableEmail } from "../../lib/temp-email";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`check-email-temp:${ip}`, 20, 60_000);
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const disposable = isDisposableEmail(email);
    return NextResponse.json({ disposable });
  } catch {
    return NextResponse.json({ disposable: false });
  }
}
