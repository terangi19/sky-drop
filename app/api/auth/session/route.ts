import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-utils";

export async function POST(req: NextRequest) {
  try {
    // Get and verify the Firebase ID token from the Authorization header
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

    // Check membership in the admin-users Firestore collection
    let dbAdmin = false;
    try {
      if (isAdminInitialized()) {
        const adminDoc = await getAdminDb().collection("admin-users").doc(uid).get();
        dbAdmin = adminDoc.exists && adminDoc.data()?.role === "admin";
      }
    } catch {}

    if (!isAdminEmail(email) && !dbAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!process.env.COOKIE_SECRET) {
      return NextResponse.json({ error: "Server not configured for sessions" }, { status: 500 });
    }

    // Create signed session payload
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
