import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sanitizeListingContent } from "../../lib/sanitize";

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function updateListingViaRest(idToken: string, docId: string, data: Record<string, unknown>): Promise<void> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/listings/${docId}?updateMask.fieldPaths=title&updateMask.fieldPaths=description&updateMask.fieldPaths=price&updateMask.fieldPaths=category&updateMask.fieldPaths=location&updateMask.fieldPaths=condition&updateMask.fieldPaths=images&updateMask.fieldPaths=imageUrl&updateMask.fieldPaths=pickupAvailable&updateMask.fieldPaths=shippingAvailable&updateMask.fieldPaths=pickupArea&updateMask.fieldPaths=shippingFee&updateMask.fieldPaths=freeShipping&updateMask.fieldPaths=shipsWithinDays&updateMask.fieldPaths=stockQuantity&updateMask.fieldPaths=saleType&updateMask.fieldPaths=startingBid&updateMask.fieldPaths=reservePrice&updateMask.fieldPaths=auctionDuration&updateMask.fieldPaths=expiresAt&updateMask.fieldPaths=updatedAt`;

  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST API error (${res.status}): ${errText}`);
  }
}

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

    if (isAdminInitialized()) {
      const docSnap = await getAdminDb().collection("listings").doc(listingId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      existingData = docSnap.data() || null;
    } else {
      // Fallback: Firestore REST API GET
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/listings/${listingId}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${idToken}` },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      const data = await res.json();
      const fields = data.fields || {};
      existingData = {};
      for (const [key, val] of Object.entries(fields)) {
        const v = val as Record<string, unknown>;
        if ("stringValue" in v) existingData[key] = v.stringValue;
        else if ("doubleValue" in v) existingData[key] = v.doubleValue;
        else if ("integerValue" in v) existingData[key] = v.integerValue;
        else if ("booleanValue" in v) existingData[key] = v.booleanValue;
        else existingData[key] = v;
      }
    }

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

    if (isAdminInitialized()) {
      await getAdminDb().collection("listings").doc(listingId).update(updateData);
    } else {
      await updateListingViaRest(idToken, listingId, updateData);
    }

    return NextResponse.json({ success: true, listingId });
  } catch (e: any) {
    console.error("[update-listing] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to update listing" }, { status: 500 });
  }
}
