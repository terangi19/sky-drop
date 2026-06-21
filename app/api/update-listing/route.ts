import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sanitizeListingContent } from "../../lib/sanitize";
import { createSystemNotification } from "../../lib/system-notifications";

export async function PUT(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`update-listing:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let token;
    try {
      token = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { listingId } = body;
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    // Fetch existing listing to verify ownership
    let existingData: Record<string, unknown> | null = null;

    const db = getServerDb(idToken);
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
    if (!existingSellerId || existingSellerId !== token.uid) {
      return NextResponse.json({ error: "You don't have permission to edit this listing" }, { status: 403 });
    }

    // Sanitize and validate allowed fields
    const { title, description, price, category, location, condition, images } = body;

    // KYC check for price cap on update
    if (price !== undefined && isAdminInitialized()) {
      const numericPrice = Number(price) || 0;
      const profileSnap = await getAdminDb().collection("profiles").doc(token.uid).get();
      const profile = profileSnap.data();
      const kycApproved = profile?.kycStatus === "approved";
      if (numericPrice > 0 && !kycApproved && numericPrice > 600) {
        return NextResponse.json({
          error: "The maximum price for non-KYC sellers is $600. Verify your ID (KYC) to unlock unlimited pricing.",
        }, { status: 400 });
      }
    }

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
      "pricingType",
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

    // Price-drop alert: notify watchers when price is lowered
    if (isAdminInitialized() && price !== undefined && existingData.price !== String(price)) {
      const oldPrice = Number(existingData.price) || 0;
      const newPrice = Number(price) || 0;
      if (newPrice > 0 && newPrice < oldPrice) {
        try {
          const watchers = await getAdminDb().collection("watchlist").where("listingId", "==", listingId).limit(100).get();
          for (const doc of watchers.docs) {
            const data = doc.data();
            const watcherEmail = data.userEmail;
            if (!watcherEmail || typeof watcherEmail !== "string") continue;
            await createSystemNotification({
              targetEmail: watcherEmail,
              fromEmail: token.email || existingData.sellerEmail as string || "system@skydrop.nz",
              type: "price_drop",
              title: "Price dropped",
              message: `"${String(existingData.title || "A listing")}" dropped from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}`,
              listingId,
              listingTitle: String(existingData.title || ""),
              listingImage: String((existingData.images as string[])?.[0] || existingData.imageUrl || ""),
            });
          }
        } catch (e) {
          console.error("[update-listing] Price-drop notification failed:", e);
        }
      }
    }

    return NextResponse.json({ success: true, listingId });
  } catch (e: any) {
    console.error("[update-listing] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
