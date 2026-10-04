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
    try {
      // Single write (no pre-read); update() fails with NOT_FOUND (gRPC code 5) if the listing is gone.
      // onListingUpdated no-ops when only views change.
      await db
        .collection("listings")
        .doc(listingId)
        .update({ views: FieldValue.increment(1) });
    } catch (e: unknown) {
      const code = (e as { code?: number | string })?.code;
      if (code === 5 || code === "not-found") {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[listing-view]", e);
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }
}
