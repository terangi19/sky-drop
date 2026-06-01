import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb, isAdminInitialized } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-utils";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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
      const db2 = getServerDb(idToken);
      const adminDoc = await db2.collection("admin-users").doc(uid).get();
      dbAdmin = adminDoc.exists && adminDoc.data()?.role === "admin";
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
