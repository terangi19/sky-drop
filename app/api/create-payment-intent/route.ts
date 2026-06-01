import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getServerDb, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { validateSellerForCheckout } from "../../lib/seller-payments";

const PROCESSING_FEE = 1.0;
const RESERVATION_MS = 15 * 60 * 1000;

function listingExpiresMs(listingData: Record<string, unknown>): number | null {
  const expiresAt = listingData.expiresAt as { toMillis?: () => number } | string | undefined;
  if (!expiresAt) return null;
  if (typeof expiresAt === "object" && typeof expiresAt.toMillis === "function") {
    return expiresAt.toMillis();
  }
  const t = new Date(expiresAt as string).getTime();
  return Number.isFinite(t) ? t : null;
}

function reservedMsAgo(listingData: Record<string, unknown>): number | null {
  const reservedAt = listingData.reservedAt as { toMillis?: () => number } | string | undefined;
  if (!reservedAt) return null;
  if (typeof reservedAt === "object" && typeof reservedAt.toMillis === "function") {
    return Date.now() - reservedAt.toMillis();
  }
  const t = new Date(reservedAt as string).getTime();
  return Number.isFinite(t) ? Date.now() - t : null;
}

function computeCheckoutTotal(
  listingData: Record<string, unknown>,
  opts: { deliveryMethod?: string; winningBid?: number; shippingFee?: number }
): number {
  const base = opts.winningBid != null && opts.winningBid > 0
    ? opts.winningBid
    : Number(listingData.price) || 0;
  const listingShipping =
    listingData.shippingFee && !listingData.freeShipping
      ? Number(listingData.shippingFee)
      : 0;
  const shipping =
    opts.deliveryMethod === "shipping"
      ? (opts.shippingFee != null ? Number(opts.shippingFee) : listingShipping)
      : 0;
  const rentalDays = Number(listingData.rentalDays) || 1;
  const rentalDeposit =
    opts.deliveryMethod === "rental" ? Number(listingData.rentalDeposit) || 0 : 0;
  const itemTotal =
    opts.deliveryMethod === "rental" ? base * rentalDays : base;
  return Math.round((itemTotal + shipping + rentalDeposit + PROCESSING_FEE) * 100) / 100;
}

async function readListing(listingId: string, idToken: string, collectionName = "listings") {
  const adminInit = isAdminInitialized();
  console.log(`[payment-intent] readListing: collection=${collectionName}, id=${listingId}, isAdminInitialized=${adminInit}`);
  const db = getServerDb(idToken);
  console.log(`[payment-intent] readListing: db type=${adminInit ? "AdminSDK" : "RestAPI"}, isAdminInitialized=${isAdminInitialized()}`);
  const doc = await db.collection(collectionName).doc(listingId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  console.log(`[payment-intent] readListing: found=true, sellerEmail=${data?.sellerEmail}`);
  return data;
}

/** Optional checkout hold — never blocks payment if this fails */
async function reserveListingForCheckout(
  collectionName: string,
  listingId: string,
  buyerUid: string
): Promise<void> {
  if (!isAdminInitialized()) return;
  try {
    await getAdminDb().collection(collectionName).doc(listingId).update({
      reservedAt: FieldValue.serverTimestamp(),
      reservedBy: buyerUid,
    });
  } catch (e) {
    console.warn("[create-payment-intent] reservation skipped:", e);
  }
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
    } catch (authErr: unknown) {
      const message =
        authErr instanceof Error ? authErr.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      price,
      listingId,
      collectionName: collectionNameBody,
      deliveryMethod,
      winningBid,
      shippingFee,
    } = body;
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
    const expiresMs = listingExpiresMs(listingData as Record<string, unknown>);
    if (expiresMs !== null && expiresMs < Date.now()) {
      return NextResponse.json({ error: "This listing has expired" }, { status: 400 });
    }
    if (listingData.stockQuantity !== undefined && listingData.stockQuantity <= 0) {
      return NextResponse.json({ error: "This item is out of stock" }, { status: 400 });
    }
    const reservedAgo = reservedMsAgo(listingData as Record<string, unknown>);
    if (
      reservedAgo != null &&
      reservedAgo < RESERVATION_MS &&
      listingData.reservedBy &&
      listingData.reservedBy !== decodedToken.uid
    ) {
      return NextResponse.json(
        { error: "Someone else is checking out this item. Please try again shortly." },
        { status: 409 }
      );
    }
    if (winningBid != null && winningBid > 0) {
      if (Math.round(Number(listingData.currentBid) * 100) !== Math.round(Number(winningBid) * 100)) {
        return NextResponse.json({ error: "The winning bid amount has changed. Please refresh." }, { status: 400 });
      }
      if (listingData.highestBidder !== decodedToken.email) {
        return NextResponse.json({ error: "You are no longer the highest bidder." }, { status: 400 });
      }
    }
    if (!listingData.sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (listingData.sellerEmail === decodedToken.email) {
      return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
    }

    const expectedTotal = computeCheckoutTotal(listingData as Record<string, unknown>, {
      deliveryMethod: typeof deliveryMethod === "string" ? deliveryMethod : undefined,
      winningBid: winningBid != null ? Number(winningBid) : undefined,
      shippingFee: shippingFee != null ? Number(shippingFee) : undefined,
    });
    if (Math.abs(expectedTotal - Number(price)) > 0.02) {
      return NextResponse.json({ error: "Price mismatch. Please refresh the listing." }, { status: 400 });
    }

    await reserveListingForCheckout(collectionName, listingId, decodedToken.uid);

    console.log(`[payment-intent] fetching seller profile: email=${listingData.sellerEmail}, isAdmin=${isAdminInitialized()}`);
    const db = getServerDb(idToken);
    const sellerProfiles = await db.collection("profiles").where("email", "==", listingData.sellerEmail).limit(1).get();
    console.log(`[payment-intent] seller profiles found: ${sellerProfiles.size}`);
    const sellerError = validateSellerForCheckout(
      sellerProfiles.empty ? null : sellerProfiles.docs[0].data()
    );
    if (sellerError) {
      const status = sellerError.includes("restricted") || sellerError.includes("verified") ? 403 : 400;
      return NextResponse.json({ error: sellerError }, { status });
    }

    console.log(`[payment-intent] creating Stripe PI: amount=${requestedAmount}, listingId=${listingId}`);
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

    console.log(`[payment-intent] Stripe PI created: id=${paymentIntent.id}`);
    return NextResponse.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("[create-payment-intent] ERROR:", msg);
    console.error("[create-payment-intent] STACK:", stack);
    console.error("[create-payment-intent] ENV:", JSON.stringify({
      nodeEnv: process.env.NODE_ENV,
      isAdminInit: isAdminInitialized(),
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    }));
    const friendly =
      msg.includes("PERMISSION_DENIED") || msg.includes("insufficient permissions")
        ? "Checkout could not start. Please refresh the page and try again."
        : msg.includes("FIREBASE_SERVICE_ACCOUNT")
          ? "Payments are temporarily unavailable. Please try again later."
          : "Payment could not be processed. Please try again.";
    console.error(`[create-payment-intent] returning: "${friendly}"`);
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}

