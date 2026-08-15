import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

const NEAR_EXPIRY_MS = 3 * 86400000;

function timestampToMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function isOwnedByToken(
  listing: Record<string, unknown>,
  token: { uid: string; email?: string }
): boolean {
  if (listing.sellerId === token.uid) return true;
  const listingEmail = typeof listing.sellerEmail === "string"
    ? listing.sellerEmail.trim().toLowerCase()
    : "";
  const tokenEmail = token.email?.trim().toLowerCase() || "";
  return !!listingEmail && listingEmail === tokenEmail;
}

function isRenewable(listing: Record<string, unknown>, now: number): boolean {
  const expiresAt = timestampToMillis(listing.expiresAt);
  if (expiresAt === null) return false;
  const status = String(listing.status || "").toLowerCase();
  return (
    (status === "live" && expiresAt <= now + NEAR_EXPIRY_MS) ||
    (status === "expired" && expiresAt <= now)
  );
}

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
        const d = doc.data() as Record<string, unknown>;
        if (isOwnedByToken(d, token) && isRenewable(d, now)) {
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

    const data = listing.data()! as Record<string, unknown>;
    if (!isOwnedByToken(data, token)) {
      return NextResponse.json({ error: "You can only renew your own listings" }, { status: 403 });
    }

    if (!isRenewable(data, Date.now())) {
      return NextResponse.json(
        { error: "Only listings that are expired or within three days of expiry can be renewed" },
        { status: 409 }
      );
    }

    const { resolveListingPaymentTypeForWrite } = await import("../../lib/listing-payment-type-write");
    await listingRef.update({
      expiresAt,
      status: "live",
      updatedAt: new Date(),
      paymentType: resolveListingPaymentTypeForWrite(data.paymentType),
    });

    return NextResponse.json({
      success: true,
      title: data.title || "Listing",
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to renew listing";
    console.error("[renew-listing]", msg);
    return NextResponse.json({ error: "Failed to renew listing" }, { status: 500 });
  }
}
