import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { enforceProtection } from "../../lib/enforce-protection";
import { parseIpFromRequest } from "../../lib/geo-check";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let token;
    try { token = await verifyIdToken(authHeader.slice(7)); } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const world = typeof body.world === "string" ? body.world.trim() : "__general__";

    if (!text || text.length > 500) {
      return NextResponse.json({ error: "Shout must be 1–500 characters" }, { status: 400 });
    }

    const protection = await enforceProtection(req, {
      action: "trade_shout",
      uid: token.uid,
      email: token.email,
      ip,
      turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
    });

    if (protection.blocked) return protection.response!;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    await db.collection("tradeShouts").add({
      world,
      text,
      by: token.email,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[create-trade-shout]", e);
    return NextResponse.json({ error: "Failed to send shout" }, { status: 500 });
  }
}
