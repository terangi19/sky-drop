import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, getAdminAuth } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`renew-listing:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await verifyIdToken(authHeader.slice(7));
    const { listingId, expiresInDays } = await req.json();
    if (!listingId) {
      return NextResponse.json({ error: "Listing ID is required" }, { status: 400 });
    }

    const db = getAdminDb();
    const days = Math.max(1, Math.min(90, Number(expiresInDays) || 14));
    const expiresAt = new Date(Date.now() + days * 86400000);

    if (listingId === "__ALL__") {
      const listings = await db
        .collection("listings")
        .where("sellerEmail", "==", token.email)
        .get();

      let count = 0;
      const now = Date.now();
      for (const doc of listings.docs) {
        const d = doc.data();
        const exp = d.expiresAt?.toMillis?.();
        if (d.status === "live" && exp && exp - now < 3 * 86400000 && exp > now) {
          await doc.ref.update({ expiresAt, status: "live", updatedAt: new Date() });
          count++;
        }
      }
      return NextResponse.json({
        success: true,
        message: `${count} listing${count !== 1 ? "s" : ""} renewed`,
      });
    }

    const listingRef = db.collection("listings").doc(listingId);
    const listing = await listingRef.get();

    if (!listing.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const data = listing.data()!;
    if (data.sellerEmail !== token.email && data.userId !== token.uid) {
      return NextResponse.json({ error: "You can only renew your own listings" }, { status: 403 });
    }

    await listingRef.update({
      expiresAt,
      status: "live",
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      title: data.title || "Listing",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to renew listing";
    console.error("[renew-listing]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
