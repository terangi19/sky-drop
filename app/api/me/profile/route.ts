import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb } from "../../../lib/firebase-admin";

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

    if (!snap.exists) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    void ref.set({ lastActive: new Date() }, { merge: true }).catch(() => {});

    return NextResponse.json({ profile: snap.data() });
  } catch (err) {
    console.error("[me/profile] GET failed:", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
