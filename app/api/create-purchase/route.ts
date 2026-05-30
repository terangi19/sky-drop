import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

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

function fromFirestoreValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.timestampValue) return new Date(val.timestampValue);
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue?.values) return val.arrayValue.values.map(fromFirestoreValue);
  if (val.mapValue?.fields) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields)) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return val;
}

function makePurchaseId(listingId: string, buyerEmail: string): string {
  return `${listingId}_${buyerEmail.replace(/[@.]/g, "_")}`;
}

async function firestoreGet(projectId: string, idToken: string, path: string): Promise<any> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.fields ? fromFirestoreValue({ mapValue: { fields: data.fields } }) : data;
}

async function firestoreCreate(projectId: string, idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }
  const res = await fetch(url, {
    method: "PATCH", // PATCH with documentId in path creates or updates
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

async function firestoreUpdate(projectId: string, idToken: string, path: string, data: Record<string, unknown>): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?updateMask.fieldPaths=${Object.keys(data).join("&updateMask.fieldPaths=")}`;
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
  if (!res.ok) throw new Error(`Firestore PATCH error: ${res.status} ${await res.text()}`);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`create-purchase:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { listingId, listingTitle, listingImage, sellerEmail, buyerName, buyerPhone, deliveryMethod, shippingAddress, shippingFee, processingFee, total, badgeTransfer, type, status, digitalFileURL, digitalFileName, rentalStart, rentalEnd, rentalDays, paidAt, deliveredAt, disputeDeadline, stripePaymentIntentId, winningBid, collectionName } = body;

    if (!listingId || !sellerEmail || !stripePaymentIntentId) {
      return NextResponse.json({ error: "Missing required fields: listingId, sellerEmail, stripePaymentIntentId" }, { status: 400 });
    }

    const buyerEmail = decodedToken.email || "";
    if (!buyerEmail) {
      return NextResponse.json({ error: "Could not determine buyer email" }, { status: 400 });
    }

    const purchaseId = makePurchaseId(listingId, buyerEmail);
    const colRef = collectionName || "listings";
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";

    if (isAdminInitialized()) {
      // Production: atomic transaction with Admin SDK
      const db = getAdminDb();

      await db.runTransaction(async (transaction) => {
        const listingRef = db.collection(colRef).doc(listingId);
        const listingDoc = await transaction.get(listingRef);

        if (!listingDoc.exists) {
          throw new Error("Listing not found");
        }

        const listing = listingDoc.data()!;
        if (listing.status === "sold") {
          throw new Error("This listing has already been sold");
        }
        if (listing.expiresAt?.toMillis?.() < Date.now()) {
          throw new Error("This listing has expired");
        }
        if (listing.stockQuantity != null && listing.stockQuantity <= 0) {
          throw new Error("This item is out of stock");
        }
        if (listing.sellerEmail === buyerEmail) {
          throw new Error("You cannot purchase your own listing");
        }

        // Check existing purchase (idempotency)
        const existingPurchaseRef = db.collection("purchases").doc(purchaseId);
        const existingDoc = await transaction.get(existingPurchaseRef);
        if (existingDoc.exists) {
          // Already purchased — return existing ID
          return;
        }

        // Update listing
        const listingUpdate: Record<string, any> = {};
        if (typeof listing.stockQuantity === "number") {
          if (listing.stockQuantity > 1) {
            listingUpdate.stockQuantity = listing.stockQuantity - 1;
          } else {
            listingUpdate.stockQuantity = 0;
            if (type !== "rental") listingUpdate.status = "sold";
          }
        } else if (type !== "rental") {
          listingUpdate.status = "sold";
        }
        if (Object.keys(listingUpdate).length > 0) {
          transaction.update(listingRef, listingUpdate);
        }

        // Create purchase
        const purchaseData: Record<string, any> = {
          listingId,
          listingTitle: listingTitle || listing.title || "",
          listingPrice: winningBid ? String(winningBid) : listing.price || "",
          listingImage: listingImage || listing.images?.[0] || listing.imageUrl || listing.image || "",
          sellerEmail,
          buyerEmail,
          buyerName: buyerName || buyerEmail,
          buyerPhone: buyerPhone || "",
          deliveryMethod: deliveryMethod || "pickup",
          shippingAddress: shippingAddress || "",
          shippingFee: shippingFee || 0,
          processingFee: processingFee || 1.00,
          total: total || Number(listing.price || 0) + 1,
          badgeTransfer: badgeTransfer || "",
          type: type || "physical",
          digitalFileURL: digitalFileURL || "",
          digitalFileName: digitalFileName || "",
          status: status === "delivered" ? "delivered" : type === "rental" ? "rented" : "pending",
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          deliveredAt: deliveredAt ? new Date(deliveredAt) : null,
          disputeDeadline: disputeDeadline ? new Date(disputeDeadline) : null,
          stripePaymentIntentId,
          createdAt: new Date(),
        };

        if (rentalStart) purchaseData.rentalStart = new Date(rentalStart);
        if (rentalEnd) purchaseData.rentalEnd = new Date(rentalEnd);
        if (rentalDays) purchaseData.rentalDays = rentalDays;

        transaction.set(existingPurchaseRef, purchaseData);
      });

      return NextResponse.json({ success: true, purchaseId });
    } else {
      // Dev mode: Firestore REST API with user's ID token
      // Not atomic, but server-side checks + Firestore rules enforce integrity

      // 1. Fetch listing
      const listing = await firestoreGet(projectId, idToken, `${colRef}/${listingId}`);
      if (!listing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      if (listing.status === "sold") {
        return NextResponse.json({ error: "This listing has already been sold" }, { status: 400 });
      }

      // 2. Check existing purchase (idempotency)
      const existingPurchase = await firestoreGet(projectId, idToken, `purchases/${purchaseId}`);
      if (existingPurchase) {
        return NextResponse.json({ success: true, purchaseId, existing: true });
      }

      // 3. Create purchase document
      const purchaseData: Record<string, unknown> = {
        listingId,
        listingTitle: listingTitle || listing.title || "",
        listingPrice: winningBid ? String(winningBid) : listing.price || "",
        listingImage: listingImage || (listing.images?.[0]) || listing.imageUrl || listing.image || "",
        sellerEmail,
        buyerEmail,
        buyerName: buyerName || buyerEmail,
        buyerPhone: buyerPhone || "",
        deliveryMethod: deliveryMethod || "pickup",
        shippingAddress: shippingAddress || "",
        shippingFee: shippingFee || 0,
        processingFee: processingFee || 1.00,
        total: total || Number(listing.price || 0) + 1,
        badgeTransfer: badgeTransfer || "",
        type: type || "physical",
        digitalFileURL: digitalFileURL || "",
        digitalFileName: digitalFileName || "",
        status: status === "delivered" ? "delivered" : type === "rental" ? "rented" : "pending",
        paidAt: new Date().toISOString(),
        deliveredAt: deliveredAt || null,
        disputeDeadline: disputeDeadline || null,
        stripePaymentIntentId,
        createdAt: new Date().toISOString(),
      };

      if (rentalStart) purchaseData.rentalStart = rentalStart;
      if (rentalEnd) purchaseData.rentalEnd = rentalEnd;
      if (rentalDays) purchaseData.rentalDays = rentalDays;

      await firestoreCreate(projectId, idToken, `purchases/${purchaseId}`, purchaseData);

      // 4. Update listing
      const listingUpdate: Record<string, unknown> = {};
      if (typeof listing.stockQuantity === "number") {
        if (listing.stockQuantity > 1) {
          listingUpdate.stockQuantity = listing.stockQuantity - 1;
        } else {
          listingUpdate.stockQuantity = 0;
          if (type !== "rental") listingUpdate.status = "sold";
        }
      } else if (type !== "rental") {
        listingUpdate.status = "sold";
      }
      if (Object.keys(listingUpdate).length > 0) {
        await firestoreUpdate(projectId, idToken, `${colRef}/${listingId}`, listingUpdate);
      }

      return NextResponse.json({ success: true, purchaseId });
    }
  } catch (e: any) {
    console.error("[create-purchase] Error:", e?.message || e);
    return NextResponse.json({ error: e.message || "Failed to create purchase" }, { status: 500 });
  }
}
