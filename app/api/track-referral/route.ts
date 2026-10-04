import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminAuth, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import {
  REFERRAL_MAX_ACCOUNT_AGE_MS,
  isFreshAccount,
  isSelfReferral,
  pickOldestProfile,
  referralEventId,
} from "../../lib/referral-claim";

const REFERRAL_SIGNUP_MESSAGE = "Someone signed up using your referral code!";

function accountCreationMs(creationTime: string | undefined): number | null {
  if (!creationTime) return null;
  const ms = Date.parse(creationTime);
  return Number.isFinite(ms) ? ms : null;
}

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

    const uidLimit = await rateLimit(`track-referral-uid:${decoded.uid}`, 3, 60 * 60_000);
    if (!uidLimit.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const userRecord = await getAdminAuth().getUser(decoded.uid);
    const createdMs = accountCreationMs(userRecord.metadata?.creationTime);
    if (
      createdMs == null ||
      !isFreshAccount(createdMs, Date.now(), REFERRAL_MAX_ACCOUNT_AGE_MS)
    ) {
      return NextResponse.json({ tracked: false });
    }

    const db = getAdminDb();
    const referrerSnap = await db
      .collection("profiles")
      .where("referralCode", "==", code)
      .limit(5)
      .get();

    if (referrerSnap.empty) {
      return NextResponse.json({ tracked: false });
    }

    if (referrerSnap.size > 1) {
      console.warn("[track-referral] duplicate referral code holders", {
        count: referrerSnap.size,
      });
    }

    const holders = referrerSnap.docs.map((docSnap) => {
      const data = docSnap.data() ?? {};
      return {
        id: docSnap.id,
        ref: docSnap.ref,
        createdAt: data.createdAt,
        memberSince: data.memberSince,
        email: typeof data.email === "string" ? data.email : "",
      };
    });
    const referrer = pickOldestProfile(holders);
    if (!referrer) {
      return NextResponse.json({ tracked: false });
    }

    const referrerEmail = referrer.email;
    const referredEmail = decoded.email || "";

    if (
      isSelfReferral({
        referrerUid: referrer.id,
        refereeUid: decoded.uid,
        referrerEmail,
        refereeEmail: referredEmail,
      })
    ) {
      return NextResponse.json({ tracked: false });
    }

    const eventRef = db.collection("referralEvents").doc(referralEventId(decoded.uid));
    const refereeRef = db.collection("profiles").doc(decoded.uid);

    const created = await db.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      const refereeSnap = await tx.get(refereeRef);
      if (eventSnap.exists) return false;
      const refereeData = refereeSnap.data() ?? {};
      if (refereeData.referredBy) return false;

      tx.create(eventRef, {
        type: "signup",
        referrerUid: referrer.id,
        referrerEmail,
        refereeUid: decoded.uid,
        referredEmail,
        code,
        rewardedAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(referrer.ref, { referralSignups: FieldValue.increment(1) });
      tx.set(
        refereeRef,
        { referredBy: code, referredByUid: referrer.id },
        { merge: true }
      );
      return true;
    });

    if (!created) {
      return NextResponse.json({ tracked: false });
    }

    await db.collection("notifications").add({
      type: "referral",
      targetEmail: referrerEmail,
      title: REFERRAL_SIGNUP_MESSAGE,
      message: REFERRAL_SIGNUP_MESSAGE,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ tracked: true, referredBy: code });
  } catch (e: unknown) {
    console.error("[track-referral]", e);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }
}
