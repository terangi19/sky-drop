import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { isPhoneBlacklisted } from "../../lib/ban-store";
import { isPhoneRegisteredToOtherUser } from "../../lib/phone-registry.server";
import { formatNZPhone, isValidNzMobile } from "../../lib/phone-format";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";

async function isPhoneOnProfile(phone: string, excludeUid?: string): Promise<boolean> {
  if (!isAdminInitialized()) return false;
  const db = getAdminDb();
  const snap = await db.collection("profiles").where("phone", "==", phone).limit(1).get();
  if (snap.empty) return false;
  if (!excludeUid) return true;
  return snap.docs[0].id !== excludeUid;
}

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`check-phone:${ip}`, 15, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

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

    const registryTaken = await isPhoneRegisteredToOtherUser(
      formatted,
      uid || "__no_uid__"
    );
    const profileTaken = await isPhoneOnProfile(formatted, uid || undefined);

    if (registryTaken || profileTaken) {
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
