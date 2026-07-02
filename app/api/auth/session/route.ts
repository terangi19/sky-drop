import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../lib/firebase-admin";
import { isAdminUser } from "../../../lib/admin-check.server";
import { parseIpFromRequest } from "../../../lib/geo-check";
import { frictionLimit, shouldSkipCaptcha, type FrictionInput } from "../../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../../lib/request-body";
import { verifyTurnstileToken, isTurnstileConfigured } from "../../../lib/turnstile";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

    const body = await req.json().catch(() => ({}));

    const frictionInput: FrictionInput = { ip, action: "login" };
    const rl = await frictionLimit(`auth-session:${ip}`, 8, 60_000, frictionInput);

    if (isTurnstileConfigured() && !shouldSkipCaptcha(rl.riskTier)) {
      const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        return NextResponse.json({ error: "Security check failed" }, { status: 403 });
      }
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const email = decodedToken.email || "";
    const uid = decodedToken.uid;

    if (!(await isAdminUser(email, uid))) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!process.env.COOKIE_SECRET) {
      return NextResponse.json({ error: "Server not configured for sessions" }, { status: 500 });
    }

    const payload = { email, uid, admin: true, exp: Date.now() + 86400000 };
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(process.env.COOKIE_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const data = encoder.encode(JSON.stringify(payload));
    const signature = await crypto.subtle.sign("HMAC", key, data);
    const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
    const token = btoa(JSON.stringify(payload)) + "." + sigHex;

    const response = NextResponse.json({ success: true, email });
    response.cookies.set("admin-session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    });

    return response;
  } catch (e: any) {
    console.error("[auth/session] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
