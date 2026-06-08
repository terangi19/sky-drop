import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, isAdminInitialized } from "../../lib/firebase-admin";
import { isPhoneBlacklisted } from "../../lib/ban-store";
import { isPhoneRegisteredToOtherUser } from "../../lib/phone-registry.server";
import { formatNZPhone, isValidNzMobile } from "../../lib/phone-format";

export async function POST(req: NextRequest) {
  try {
    const { phone, uid: bodyUid } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }

    const formatted = formatNZPhone(phone);
    if (!isValidNzMobile(formatted)) {
      return NextResponse.json({
        available: false,
        reason: "invalid",
        message: "Enter a valid NZ mobile number (e.g. 021 123 4567).",
      });
    }

    if (await isPhoneBlacklisted(formatted)) {
      return NextResponse.json({
        available: false,
        reason: "blacklisted",
        message: "This phone number cannot be used. Contact support.",
      });
    }

    let uid = typeof bodyUid === "string" ? bodyUid : "";
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ") && isAdminInitialized()) {
      try {
        const decoded = await verifyIdToken(authHeader.slice(7));
        uid = decoded.uid;
      } catch {}
    }

    if (uid && (await isPhoneRegisteredToOtherUser(formatted, uid))) {
      return NextResponse.json({
        available: false,
        reason: "taken",
        message:
          "This phone number is already linked to another Sky Drop account. Each number can only be used once.",
      });
    }

    return NextResponse.json({ available: true, phone: formatted });
  } catch {
    return NextResponse.json({ available: false, reason: "error" }, { status: 500 });
  }
}
