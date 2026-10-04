import { NextRequest, NextResponse } from "next/server";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { RATE_LIMITS } from "../../lib/rate-limit-config";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { isDisposableEmail } from "../../lib/temp-email";

const MAX_EMAIL_LEN = 254;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const rl = RATE_LIMITS.checkEmailTemp; // single source of truth (15/min), same key name as today's prefix
    const { allowed } = await rateLimit(`${rl.name}:${ip}`, rl.max, rl.windowMs);
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > MAX_EMAIL_LEN || email.indexOf("@") < 1) {
      return NextResponse.json({ error: "Email is required" }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json({ disposable: isDisposableEmail(email) }, { headers: NO_STORE });
  } catch (e) {
    console.error("[check-email-temp]", e);
    return NextResponse.json({ error: "Could not check email" }, { status: 500, headers: NO_STORE });
  }
}
