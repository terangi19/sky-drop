import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminAuth, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { claimVerifiedPhoneForUser } from "../../lib/phone-registry.server";
import { formatNZPhone, isValidNzMobile } from "../../lib/phone-format";

export async function POST(req: NextRequest) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`claim-phone:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const userRecord = await getAdminAuth().getUser(decoded.uid);

    let phone = String(userRecord.phoneNumber || "").trim();
    if (!phone && typeof body.phone === "string" && body.phone.trim()) {
      const candidate = formatNZPhone(body.phone);
      if (process.env.NODE_ENV === "development" && isValidNzMobile(candidate)) {
        phone = candidate;
      }
    }

    if (!phone) {
      return NextResponse.json(
        {
          error:
            "Complete the SMS verification first. Enter the code we sent, then try again.",
        },
        { status: 400 }
      );
    }

    const result = await claimVerifiedPhoneForUser({
      uid: decoded.uid,
      phone,
      email: decoded.email,
    });

    if (result.ok === false) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, phone: result.phone });
  } catch (e: unknown) {
    console.error("[claim-verified-phone]", e);
    return NextResponse.json({ error: "Failed to verify phone" }, { status: 500 });
  }
}
