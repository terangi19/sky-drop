import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb } from "../../../lib/firebase-admin";
import { serializeProfileForClient } from "../../../lib/firestore-serialize";
import { ensureProfileForAuthenticatedUser } from "../../../lib/ensure-profile.server";
import { verifiedFlagAfterUpdate } from "../../../lib/seller-verified";

/** Load the signed-in user's profile via Admin SDK (avoids client Firestore rule races). */
export async function GET(req: NextRequest) {
  try {
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

    const db = getServerDb();
    const ref = db.collection("profiles").doc(decoded.uid);
    const snap = await ref.get();

    // This boundary is also the idempotent repair path for legacy/corrupt
    // profiles whose canonical username or reservation is missing.
    const loaded = await ensureProfileForAuthenticatedUser({
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
    });
    const profile: Record<string, unknown> = { ...loaded };

    const emailVerified = decoded.email_verified === true;
    if (profile.emailVerified !== emailVerified) {
      const verified = verifiedFlagAfterUpdate(profile, { emailVerified });
      await ref.set({ emailVerified, verified, lastActive: new Date() }, { merge: true }).catch(() => {});
      profile.emailVerified = emailVerified;
      profile.verified = verified;
    } else {
      void ref.set({ lastActive: new Date() }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({
      profile: serializeProfileForClient(profile),
      recovered: !snap.exists,
    });
  } catch (err) {
    console.error("[me/profile] GET failed:", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
