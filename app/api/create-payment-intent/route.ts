import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { getAdminDb, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { validateSellerForCheckout } from "../../lib/seller-payments";
import { isListingAvailableForPurchase } from "../../lib/listing-availability";
import { requireVerifiedEmail } from "../../lib/require-verified";
import {
  adminGetListing,
  adminGetSellerProfileByEmail,
  adminReserveListing,
  requireAdminForCheckout,
} from "../../lib/checkout-server";
import { sanitizeCheckoutCollectionName } from "../../lib/payment-checkout";
import { isContactPaymentType } from "../../lib/listing-payment-type";

const PROCESSING_FEE = 1.0;
const RESERVATION_MS = 15 * 60 * 1000;

async function adminGetPurchase(purchaseId: string): Promise<Record<string, unknown> | null> {
  requireAdminForCheckout();
  const snap = await getAdminDb().collection("purchases").doc(purchaseId).get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

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
  const base =
    opts.winningBid != null && opts.winningBid > 0
      ? opts.winningBid
      : Number(listingData.price) || 0;
  const listingShipping =
    listingData.shippingFee && !listingData.freeShipping
      ? Number(listingData.shippingFee)
      : 0;
  const shipping =
    opts.deliveryMethod === "shipping"
      ? opts.shippingFee != null
        ? Number(opts.shippingFee)
        : listingShipping
      : 0;
  const rentalDays = Number(listingData.rentalDays) || 1;
  const rentalDeposit =
    opts.deliveryMethod === "rental" ? Number(listingData.rentalDeposit) || 0 : 0;
  const itemTotal = opts.deliveryMethod === "rental" ? base * rentalDays : base;
  return Math.round((itemTotal + shipping + rentalDeposit + PROCESSING_FEE) * 100) / 100;
}

export async function POST(req: NextRequest) {
  try {
    requireAdminForCheckout();

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

    let decodedToken;
    try {
      decodedToken = await verifyIdToken(authHeader.slice(7));
    } catch (authErr: unknown) {
      const message =
        authErr instanceof Error ? authErr.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const verified = requireVerifiedEmail(decodedToken, "making a purchase");
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
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
      purchaseId,
    } = body;
    const collectionName = sanitizeCheckoutCollectionName(collectionNameBody);

    if (!listingId || price == null || price === "" || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const requestedAmount = Math.round(Number(price) * 100);
    if (requestedAmount < 50) {
      return NextResponse.json(
        { error: "Order total must be at least $0.50." },
        { status: 400 }
      );
    }

    const listingData = await adminGetListing(collectionName, listingId);
    if (!listingData) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (isContactPaymentType(listingData.paymentType)) {
      return NextResponse.json(
        {
          error:
            "This listing uses Arrange Purchase. Use the green Purchase button to message the seller — no Stripe required.",
        },
        { status: 400 }
      );
    }
    if (!isListingAvailableForPurchase(listingData)) {
      return NextResponse.json(
        { error: "This listing is no longer available" },
        { status: 400 }
      );
    }

    const expiresMs = listingExpiresMs(listingData);
    if (expiresMs !== null && expiresMs < Date.now()) {
      return NextResponse.json({ error: "This listing has expired" }, { status: 400 });
    }

    const reservedAgo = reservedMsAgo(listingData);
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

    if (winningBid != null && Number(winningBid) > 0) {
      if (
        Math.round(Number(listingData.currentBid) * 100) !==
        Math.round(Number(winningBid) * 100)
      ) {
        return NextResponse.json(
          { error: "The winning bid amount has changed. Please refresh." },
          { status: 400 }
        );
      }
      if (listingData.highestBidder !== decodedToken.email) {
        return NextResponse.json(
          { error: "You are no longer the highest bidder." },
          { status: 400 }
        );
      }
    }

    const sellerEmail = String(listingData.sellerEmail || "");
    if (!sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (sellerEmail === decodedToken.email) {
      return NextResponse.json(
        { error: "You cannot purchase your own listing" },
        { status: 400 }
      );
    }

    let expectedTotal = computeCheckoutTotal(listingData, {
      deliveryMethod: typeof deliveryMethod === "string" ? deliveryMethod : undefined,
      winningBid: winningBid != null ? Number(winningBid) : undefined,
      shippingFee: shippingFee != null ? Number(shippingFee) : undefined,
    });

    if (typeof purchaseId === "string" && purchaseId.trim()) {
      const purchaseSnap = await adminGetPurchase(purchaseId.trim());
      if (!purchaseSnap) {
        return NextResponse.json({ error: "Accepted offer not found" }, { status: 404 });
      }
      const purchase = purchaseSnap;
      if (String(purchase.buyerEmail || "") !== String(decodedToken.email || "")) {
        return NextResponse.json({ error: "Offer payment does not match your account" }, { status: 403 });
      }
      if (String(purchase.listingId || "") !== listingId) {
        return NextResponse.json({ error: "Offer payment does not match this listing" }, { status: 400 });
      }
      if (String(purchase.status || "") !== "offer_accepted") {
        return NextResponse.json({ error: "This offer is no longer payable" }, { status: 400 });
      }
      expectedTotal = Number(purchase.total) || expectedTotal;
    }
    if (Math.abs(expectedTotal - Number(price)) > 0.02) {
      return NextResponse.json(
        {
          error: `Price mismatch (expected $${expectedTotal.toFixed(2)}). Please refresh the listing.`,
        },
        { status: 400 }
      );
    }

    try {
      await adminReserveListing(collectionName, listingId, decodedToken.uid);
    } catch (reservationError) {
      const message =
        reservationError instanceof Error ? reservationError.message : String(reservationError);
      if (message.includes("LISTING_RESERVED")) {
        return NextResponse.json(
          { error: "Someone else is checking out this item. Please try again shortly." },
          { status: 409 }
        );
      }
      throw reservationError;
    }

    const sellerProfile = await adminGetSellerProfileByEmail(sellerEmail);
    const sellerError = validateSellerForCheckout(sellerProfile);
    if (sellerError) {
      const status =
        sellerError.includes("restricted") || sellerError.includes("verified")
          ? 403
          : 400;
      return NextResponse.json({ error: sellerError }, { status });
    }

    const sellerStripeAccountId = sellerProfile?.stripeAccountId as string | undefined;
    if (!sellerStripeAccountId) {
      return NextResponse.json({ error: "Seller has not set up payouts" }, { status: 400 });
    }

    const applicationFeeAmount = Math.round(PROCESSING_FEE * 100);

    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: requestedAmount,
        currency: "nzd",
        description: `Sky Drop: ${title}`,
        metadata: {
          listingId,
          title,
          purchaseId: typeof purchaseId === "string" ? purchaseId.trim() : "",
          buyerUid: decodedToken.uid,
          buyerEmail: decodedToken.email || "",
          sellerEmail,
          collectionName,
          destinationCharge: "true",
        },
        automatic_payment_methods: { enabled: true },
        transfer_data: {
          destination: sellerStripeAccountId,
        },
        application_fee_amount: applicationFeeAmount,
      },
      {
        idempotencyKey: purchaseId
          ? `payment-offer-${String(purchaseId).trim()}-${decodedToken.uid}`
          : `payment-${listingId}-${decodedToken.uid}`,
      }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[create-payment-intent] Error:", msg);
    console.error("[create-payment-intent] Full error:", err);

    if (msg.includes("CHECKOUT_SERVER_NOT_CONFIGURED")) {
      return NextResponse.json(
        {
          error:
            "Checkout is not available right now. The site owner needs to set FIREBASE_SERVICE_ACCOUNT on the server.",
        },
        { status: 503 }
      );
    }

    if (msg.includes("Stripe") || msg.includes("stripe")) {
      return NextResponse.json(
        { error: "Payment service error. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `Payment could not be processed: ${msg}` },
      { status: 500 }
    );
  }
}
