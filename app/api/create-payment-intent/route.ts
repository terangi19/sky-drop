import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

async function readListing(listingId: string, idToken: string) {
  if (isAdminInitialized()) {
    const doc = await getAdminDb().collection("listings").doc(listingId).get();
    if (!doc.exists) return null;
    return doc.data();
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/listings/${listingId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore error: ${res.status}`);
  const body = await res.json();
  if (!body.fields) return null;
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(body.fields)) {
    obj[k] = convertFirestoreValue(v as any);
  }
  return obj;
}

function convertFirestoreValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.integerValue !== undefined) return Number(val.integerValue);
  if (val.timestampValue) return new Date(val.timestampValue);
  if (val.nullValue !== undefined) return null;
  if (val.arrayValue?.values) return val.arrayValue.values.map(convertFirestoreValue);
  if (val.mapValue?.fields) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields)) {
      result[k] = convertFirestoreValue(v);
    }
    return result;
  }
  return val;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`payment:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });
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

    const { title, price, listingId, collectionName } = await req.json();
    if (!listingId || !price || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestedAmount = Math.round(Number(price) * 100);
    if (requestedAmount < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Server-side listing verification (always runs)
    const listingData = await readListing(listingId, idToken);
    if (!listingData) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listingData.status === "sold") {
      return NextResponse.json({ error: "This listing has already sold" }, { status: 400 });
    }
    const expiresMs = listingData.expiresAt
      ? (typeof listingData.expiresAt === "object" && "toMillis" in listingData.expiresAt
          ? listingData.expiresAt.toMillis()
          : new Date(listingData.expiresAt).getTime())
      : null;
    if (expiresMs !== null && expiresMs < Date.now()) {
      return NextResponse.json({ error: "This listing has expired" }, { status: 400 });
    }
    if (listingData.stockQuantity !== undefined && listingData.stockQuantity <= 0) {
      return NextResponse.json({ error: "This item is out of stock" }, { status: 400 });
    }
    if (!listingData.sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (listingData.sellerEmail === decodedToken.email) {
      return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
    }

    // Verify price matches listing
    const listingPrice = Number(listingData.price);
    if (listingPrice > 0 && Math.abs(listingPrice - Number(price)) > 0.01) {
      return NextResponse.json({ error: "Price mismatch. Please refresh the listing." }, { status: 400 });
    }

    // Seller trust check
    if (isAdminInitialized()) {
      const sellerProfiles = await getAdminDb().collection("profiles").where("email", "==", listingData.sellerEmail).limit(1).get();
      if (!sellerProfiles.empty) {
        const sellerProfile = sellerProfiles.docs[0].data();
        if (sellerProfile.restricted) {
          return NextResponse.json({ error: "This seller is restricted." }, { status: 403 });
        }
        if (!sellerProfile.emailVerified) {
          return NextResponse.json({ error: "Seller has not verified their email." }, { status: 403 });
        }
        if (!sellerProfile.stripeAccountId) {
          return NextResponse.json({ error: "This seller has not set up payouts yet." }, { status: 400 });
        }
      }
    }

    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: requestedAmount,
        currency: "nzd",
        description: `Sky Drop: ${title}`,
        metadata: { listingId, title, buyerUid: decodedToken.uid, buyerEmail: decodedToken.email || "", collectionName: collectionName || "listings" },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `payment-${listingId}-${decodedToken.uid}` }
    );

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err: any) {
    console.error("[create-payment-intent] Error:", err?.code || err?.message || err);
    return NextResponse.json({ error: "Payment could not be processed. Please try again." }, { status: 500 });
  }
}

