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
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const price = typeof body.price === "string" ? body.price.trim() : "";

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const protection = await enforceProtection(req, {
      action: "trade_post",
      uid: token.uid,
      email: token.email,
      ip,
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
    });

    if (protection.blocked) return protection.response!;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const ref = await db.collection("tradePosts").add({
      title,
      description,
      price: price || null,
      sellerEmail: token.email,
      sellerId: token.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: unknown) {
    console.error("[create-trade-post]", e);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
