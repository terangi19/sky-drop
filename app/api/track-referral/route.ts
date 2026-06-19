import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";

export async function POST(req: NextRequest) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`track-referral:${ip}`, 8, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    if (isContentLengthOverLimit(req, DEFAULT_MAX_JSON_BYTES)) return payloadTooLargeResponse();

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

    const { referralCode } = await req.json();
    if (!referralCode || typeof referralCode !== "string") {
      return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
    }

    const code = referralCode.trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ tracked: false });
    }

    const db = getAdminDb();
    const referrerSnap = await db
      .collection("profiles")
      .where("referralCode", "==", code)
      .limit(1)
      .get();

    if (referrerSnap.empty) {
      return NextResponse.json({ tracked: false });
    }

    const referrerDoc = referrerSnap.docs[0];
    const referrerData = referrerDoc.data();
    const referrerEmail = typeof referrerData.email === "string" ? referrerData.email : "";
    const referredEmail = decoded.email || "";

    if (!referrerEmail || referrerEmail === referredEmail) {
      return NextResponse.json({ tracked: false });
    }

    await referrerDoc.ref.update({ referralSignups: FieldValue.increment(1) });

    await db.collection("referralEvents").add({
      type: "signup",
      referrerEmail,
      referredEmail,
      createdAt: new Date(),
    });

    await db.collection("notifications").add({
      type: "referral",
      targetEmail: referrerEmail,
      fromEmail: referredEmail,
      title: "🎉 You referred someone!",
      message: `${referredEmail} signed up using your referral code!`,
      read: false,
      createdAt: new Date(),
    });

    return NextResponse.json({ tracked: true, referredBy: code });
  } catch (e: unknown) {
    console.error("[track-referral]", e);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }
}
