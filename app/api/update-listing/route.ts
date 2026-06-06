import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "../../lib/firebase-admin";
import { applyRateLimit, authenticateRequest, isErrorResponse } from "../../lib/api-helpers";
import { sanitizeListingContent } from "../../lib/sanitize";

export async function PUT(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "update-listing", 10);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const body = await req.json();
    const { listingId } = body;
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // Fetch existing listing to verify ownership
    let existingData: Record<string, unknown> | null = null;

    const db = getServerDb(auth.idToken);
    const docSnap = await db.collection("listings").doc(listingId).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    existingData = docSnap.data() || null;

    if (!existingData) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Ownership check: sellerId must match the authenticated user
    const existingSellerId = existingData.sellerId as string | undefined;
    if (!existingSellerId || existingSellerId !== auth.uid) {
      return NextResponse.json({ error: "You don't have permission to edit this listing" }, { status: 403 });
    }

    // Sanitize and validate allowed fields
    const { title, description, price, category, location, condition, images } = body;

    const sanitizedTitle = title !== undefined ? sanitizeListingContent(String(title)) : undefined;
    const sanitizedDesc = description !== undefined ? sanitizeListingContent(String(description)) : undefined;

    if (sanitizedTitle !== undefined && sanitizedTitle.length < 1) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }

    const allowedFields: string[] = [
      "images", "location", "condition",
      "pickupAvailable", "shippingAvailable", "pickupArea",
      "shippingFee", "freeShipping", "shipsWithinDays", "stockQuantity",
      "saleType", "startingBid", "reservePrice", "expiresInDays",
      "paymentType",
    ];
    const updateData: Record<string, unknown> = {};

    if (sanitizedTitle !== undefined) updateData.title = sanitizedTitle;
    if (sanitizedDesc !== undefined) updateData.description = sanitizedDesc;
    if (price !== undefined) updateData.price = String(price);
    if (category !== undefined) updateData.category = category;
    if (images !== undefined) updateData.images = images;

    for (const key of allowedFields) {
      if (key in body) {
        if (key === "stockQuantity") {
          const val = body[key];
          if (val === undefined || val === null || val === "" || Number(val) <= 0) continue;
          updateData[key] = Number(val);
        } else {
          updateData[key] = body[key];
        }
      }
    }

    updateData.updatedAt = new Date();
    updateData.imageUrl = (updateData.images as string[])?.[0] || (existingData.imageUrl as string) || "";

    await db.collection("listings").doc(listingId).update(updateData);

    return NextResponse.json({ success: true, listingId });
  } catch (e: any) {
    console.error("[update-listing] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
