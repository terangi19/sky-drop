import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getServerDb, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sanitizeListingContent } from "../../lib/sanitize";
import { createSystemNotification } from "../../lib/system-notifications";
import { stripeListingPublishErrorAsync } from "../../lib/stripe-connect-account";
import { validateListingForPublish } from "../../lib/listing-validation";

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

    // Ownership: sellerId (preferred) or sellerEmail for legacy listings
    const existingSellerId = existingData.sellerId as string | undefined;
    const existingSellerEmail = existingData.sellerEmail as string | undefined;
    const ownsByUid = !!existingSellerId && existingSellerId === token.uid;
    const ownsByEmail =
      !!existingSellerEmail &&
      !!token.email &&
      existingSellerEmail.toLowerCase() === token.email.toLowerCase();
    if (!ownsByUid && !ownsByEmail) {
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
      "images", "thumbnails", "location", "condition",
      "pickupAvailable", "shippingAvailable", "pickupArea",
      "shippingFee", "freeShipping", "shipsWithinDays", "stockQuantity",
      "saleType", "startingBid", "reservePrice", "expiresInDays",
      "paymentType",
      "pricingType",
      "servicePricingType", "serviceDuration",
      "rentalSubType", "rentalRatePeriod", "rentalPriceHourly",
      "rentalPriceWeekly", "rentalPriceMonthly", "rentalDeposit", "rentalAvailableDate",
      "vehicleMake", "vehicleModel", "vehicleYear", "vehicleOdometer",
      "vehicleFuelType", "vehicleTransmission", "vehicleBodyType", "vehicleColour",
    ];
    const updateData: Record<string, unknown> = {};

    if (sanitizedTitle !== undefined) updateData.title = sanitizedTitle;
    if (sanitizedDesc !== undefined) updateData.description = sanitizedDesc;
    if (price !== undefined) updateData.price = String(price);
    if (category !== undefined) updateData.category = category;
    if (images !== undefined) updateData.images = images;

    for (const key of allowedFields) {
      if (key in body) {
        if (key === "paymentType") {
          const { resolveListingPaymentTypeForWrite } = await import("../../lib/listing-payment-type-write");
          updateData[key] = resolveListingPaymentTypeForWrite(body[key]);
          continue;
        }
        if (key === "stockQuantity") {
          const val = body[key];
          if (val === undefined || val === null || val === "" || Number(val) <= 0) continue;
          updateData[key] = Number(val);
        } else {
          updateData[key] = body[key];
        }
      }
    }

    const mergedForValidation = { ...existingData, ...updateData };
    const typeValidation = validateListingForPublish({
      type: (mergedForValidation.type as string) || "physical",
      title: mergedForValidation.title as string,
      description: mergedForValidation.description as string,
      price: mergedForValidation.price as string | number,
      category: mergedForValidation.category as string,
      location: mergedForValidation.location as string,
      condition: mergedForValidation.condition as string,
      servicePricingType: mergedForValidation.servicePricingType as string,
      pricingType: mergedForValidation.pricingType as string,
      rentalSubType: mergedForValidation.rentalSubType as string,
      rentalRatePeriod: mergedForValidation.rentalRatePeriod as string,
      rentalPriceWeekly: mergedForValidation.rentalPriceWeekly as string | number,
      rentalPriceMonthly: mergedForValidation.rentalPriceMonthly as string | number,
      rentalDeposit: mergedForValidation.rentalDeposit as string,
      vehicleMake: mergedForValidation.vehicleMake as string,
      vehicleModel: mergedForValidation.vehicleModel as string,
      vehicleYear: mergedForValidation.vehicleYear as string | number,
      vehicleOdometer: mergedForValidation.vehicleOdometer as string | number,
    });
    if (!typeValidation.ok) {
      return NextResponse.json(
        { error: typeValidation.errors[0] || "Invalid listing details", errors: typeValidation.errors },
        { status: 400 }
      );
    }

    updateData.updatedAt = new Date();
    updateData.imageUrl = (updateData.images as string[])?.[0] || (existingData.imageUrl as string) || "";

    const nextPaymentType = updateData.paymentType ?? existingData.paymentType;
    // When Stripe Checkout is disabled, force contact even if the field was omitted from the patch.
    {
      const { resolveListingPaymentTypeForWrite } = await import("../../lib/listing-payment-type-write");
      const enforced = resolveListingPaymentTypeForWrite(nextPaymentType);
      if (enforced !== nextPaymentType) {
        updateData.paymentType = enforced;
      }
    }
    if ((updateData.paymentType ?? existingData.paymentType) === "stripe") {
      let profileForStripe: Record<string, unknown> | null = null;
      if (isAdminInitialized()) {
        const snap = await getAdminDb().collection("profiles").doc(token.uid).get();
        if (snap.exists) profileForStripe = snap.data() as Record<string, unknown>;
      } else {
        const snap = await db.collection("profiles").doc(token.uid).get();
        if (snap.exists) profileForStripe = snap.data() as Record<string, unknown>;
      }
      const stripeErr = await stripeListingPublishErrorAsync(profileForStripe);
      if (stripeErr) {
        return NextResponse.json({ error: stripeErr }, { status: 400 });
      }
    }

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
