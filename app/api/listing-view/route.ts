import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const listingId =
      typeof body?.listingId === "string" ? body.listingId.trim() : "";

    if (!listingId || listingId.length > 128) {
      return NextResponse.json({ error: "Invalid listing id" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json(
        { error: "View tracking unavailable" },
        { status: 503 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = await rateLimit(`listing-view:${listingId}:${ip}`, 8, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const db = getAdminDb();
    const ref = db.collection("listings").doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const before = Number(snap.data()?.views) || 0;
    await ref.update({ views: FieldValue.increment(1) });

    return NextResponse.json({ views: before + 1 });
  } catch (e) {
    console.error("[listing-view]", e);
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }
}
