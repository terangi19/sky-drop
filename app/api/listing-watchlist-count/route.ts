import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const listingId =
      typeof body?.listingId === "string" ? body.listingId.trim() : "";
    const delta = body?.delta === -1 ? -1 : body?.delta === 1 ? 1 : 0;

    if (!listingId || listingId.length > 128 || delta === 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json(
        { error: "Watchlist count unavailable" },
        { status: 503 }
      );
    }

    const rl = await rateLimit(
      `listing-watchlist-count:${decoded.uid}:${listingId}`,
      20,
      60_000
    );
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const db = getAdminDb();
    const ref = db.collection("listings").doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const before = Math.max(0, Number(snap.data()?.watchlistCount) || 0);
    const after = Math.max(0, before + delta);
    await ref.update({ watchlistCount: after });

    return NextResponse.json({ watchlistCount: after });
  } catch (e) {
    console.error("[listing-watchlist-count]", e);
    return NextResponse.json(
      { error: "Failed to update watchlist count" },
      { status: 500 }
    );
  }
}
