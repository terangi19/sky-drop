import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { detachPurchasesForDeletedListing } from "../../lib/detach-purchases-for-listing";

const ALLOWED_COLLECTIONS = new Set(["listings", "tradePosts"]);

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`delete-listing:${ip}`, 15, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

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

    const sellerEmail = decoded.email || "";
    if (!sellerEmail) {
      return NextResponse.json({ error: "Could not determine seller email" }, { status: 400 });
    }

    const body = await req.json();
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const collection =
      typeof body.collection === "string" && ALLOWED_COLLECTIONS.has(body.collection)
        ? body.collection
        : "listings";

    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const listingRef = db.collection(collection).doc(listingId);
    const listingSnap = await listingRef.get();

    if (!listingSnap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const listing = listingSnap.data() || {};
    const sellerId = listing.sellerId as string | undefined;
    const listingSellerEmail = String(listing.sellerEmail || "").toLowerCase();

    const ownsListing =
      (sellerId && sellerId === decoded.uid) ||
      (listingSellerEmail && listingSellerEmail === sellerEmail.toLowerCase());

    if (!ownsListing) {
      return NextResponse.json({ error: "You can only delete your own listings" }, { status: 403 });
    }

    const detachedSales = await detachPurchasesForDeletedListing(db, listingId, sellerEmail);
    await listingRef.delete();

    return NextResponse.json({ ok: true, detachedSales });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to delete listing";
    console.error("[delete-listing]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
