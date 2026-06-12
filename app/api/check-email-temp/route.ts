import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../lib/rate-limit";
import { isDisposableEmail } from "../../lib/temp-email";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`check-email-temp:${ip}`, 30, 60_000);
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

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
