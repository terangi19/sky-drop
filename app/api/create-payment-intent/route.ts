import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { validateSellerForCheckout } from "../../lib/seller-payments";

async function readListing(listingId: string, idToken: string, collectionName = "listings") {
  const db = getServerDb(idToken);
  const doc = await db.collection(collectionName).doc(listingId).get();
  if (!doc.exists) return null;
  return doc.data();
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

    const { title, price, listingId, collectionName: collectionNameBody } = await req.json();
    const collectionName = typeof collectionNameBody === "string" && collectionNameBody ? collectionNameBody : "listings";
    if (!listingId || !price || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestedAmount = Math.round(Number(price) * 100);
    if (requestedAmount < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Server-side listing verification (always runs)
    const listingData = await readListing(listingId, idToken, collectionName);
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

    const db = getServerDb(idToken);
    const sellerProfiles = await db.collection("profiles").where("email", "==", listingData.sellerEmail).limit(1).get();
    const sellerError = validateSellerForCheckout(
      sellerProfiles.empty ? null : sellerProfiles.docs[0].data()
    );
    if (sellerError) {
      const status = sellerError.includes("restricted") || sellerError.includes("verified") ? 403 : 400;
      return NextResponse.json({ error: sellerError }, { status });
    }

    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: requestedAmount,
        currency: "nzd",
        description: `Sky Drop: ${title}`,
        metadata: {
          listingId,
          title,
          buyerUid: decodedToken.uid,
          buyerEmail: decodedToken.email || "",
          sellerEmail: listingData.sellerEmail,
          collectionName,
        },
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

