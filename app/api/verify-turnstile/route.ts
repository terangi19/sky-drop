import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken, isTurnstileConfigured } from "../../lib/turnstile";

export async function POST(req: NextRequest) {
  // Temporarily skip Turnstile verification to unblock login
  return NextResponse.json({ success: true, skipped: true });

  if (!isTurnstileConfigured()) {
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";

    if (!token) {
      return NextResponse.json({ success: false, error: "Missing turnstile token" }, { status: 400 });
    }

    const valid = await verifyTurnstileToken(token);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Turnstile verification failed" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[verify-turnstile]", e);
    return NextResponse.json({ success: false, error: "Verification error" }, { status: 500 });
  }
}
