import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { applyRateLimit, authenticateRequest, isErrorResponse, requireEmail } from "../../lib/api-helpers";
import {
  createPurchaseWithAdmin,
  findPurchaseByPaymentIntent,
  type CreatePurchaseInput,
} from "../../lib/purchase-service";
import { adminGetProfileByEmail, resolveBuyerNameForStorage } from "../../lib/profile-display-admin";
import { isListingAvailableForPurchase } from "../../lib/listing-stock";
import { getAdminDb } from "../../lib/firebase-admin";
import { validateSellerForCheckout } from "../../lib/seller-payments";
import {
  adminGetListing,
  adminGetSellerProfileByEmail,
  requireAdminForCheckout,
} from "../../lib/checkout-server";

export async function POST(req: NextRequest) {
  let stripePaymentIntentIdForRecovery = "";
  try {
    requireAdminForCheckout();

    const limited = await applyRateLimit(req, "create-purchase", 10);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const body = await req.json();
    const { listingId, stripePaymentIntentId } = body;
    stripePaymentIntentIdForRecovery = stripePaymentIntentId || "";
    if (!listingId || !stripePaymentIntentId) {
      return NextResponse.json(
        {
          error:
            "Missing payment reference. Tap Retry — if payment went through, your order may already be in Purchases.",
        },
        { status: 400 }
      );
    }

    const emailErr = requireEmail(auth, "buyer");
    if (emailErr) return emailErr;
    const buyerEmail = auth.email;

    const collectionName = body.collectionName || "listings";

    const stripe = getStripe();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    } catch {
      return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: "Payment has not completed yet. Wait a few seconds and tap Retry." },
        { status: 400 }
      );
    }

    const meta = paymentIntent.metadata || {};
    if (meta.listingId && meta.listingId !== listingId) {
      return NextResponse.json({ error: "Payment does not match this listing" }, { status: 400 });
    }
    if (meta.buyerEmail && meta.buyerEmail !== buyerEmail) {
      return NextResponse.json({ error: "Payment does not match your account" }, { status: 400 });
    }

    const existing = await findPurchaseByPaymentIntent(stripePaymentIntentId);
    if (existing) {
      return NextResponse.json({ success: true, ...existing });
    }

    const listingData = await adminGetListing(collectionName, listingId);
    if (!listingData) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (String(listingData.paymentType || "stripe") === "contact") {
      return NextResponse.json(
        {
          error:
            "This listing uses Arrange Purchase, not Stripe checkout.",
        },
        { status: 400 }
      );
    }
    const sellerEmail = String(listingData.sellerEmail || "");
    if (!sellerEmail) {
      return NextResponse.json({ error: "Listing has no seller" }, { status: 400 });
    }
    if (sellerEmail === buyerEmail) {
      return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
    }

    if (!isListingAvailableForPurchase(listingData)) {
      return NextResponse.json({ error: "This listing is no longer available" }, { status: 400 });
    }

    if (listingData.onePerBuyer) {
      const priorSnap = await getAdminDb()
        .collection("purchases")
        .where("listingId", "==", listingId)
        .where("buyerEmail", "==", buyerEmail)
        .get();
      const hasPrior = priorSnap.docs.some((d) => {
        const s = String(d.data().status || "").toLowerCase();
        return s && s !== "cancelled" && s !== "failed";
      });
      if (hasPrior) {
        return NextResponse.json(
          { error: "You can only purchase this item once per buyer." },
          { status: 400 }
        );
      }
    }

    const sellerProfile = await adminGetSellerProfileByEmail(sellerEmail);
    const sellerError = validateSellerForCheckout(sellerProfile);
    if (sellerError) {
      const status =
        sellerError.includes("restricted") || sellerError.includes("verified") ? 403 : 400;
      return NextResponse.json({ error: sellerError }, { status });
    }

    const buyerProfile = await adminGetProfileByEmail(buyerEmail);
    const buyerName = resolveBuyerNameForStorage(body.buyerName, buyerProfile, buyerEmail);

    const input: CreatePurchaseInput = {
      listingId: body.listingId,
      listingTitle: body.listingTitle || "",
      listingPrice: body.listingPrice || String(listingData.price || ""),
      listingImage: body.listingImage || "",
      sellerEmail,
      buyerEmail,
      buyerName,
      buyerPhone: body.buyerPhone || "",
      deliveryMethod: body.deliveryMethod || "pickup",
      shippingAddress: body.shippingAddress || "",
      shippingFee: body.shippingFee || 0,
      processingFee: body.processingFee || 1.0,
      total: body.total || Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100,
      badgeTransfer: body.badgeTransfer || "",
      type: body.type || "physical",
      digitalFileURL: body.digitalFileURL || "",
      digitalFileName: body.digitalFileName || "",
      status: body.status || "pending",
      rentalStart: body.rentalStart || null,
      rentalEnd: body.rentalEnd || null,
      rentalDays: body.rentalDays || null,
      disputeDeadline: body.disputeDeadline || null,
      stripePaymentIntentId,
      paidAt: body.paidAt || new Date().toISOString(),
      deliveredAt: body.deliveredAt || null,
      winningBid: body.winningBid || null,
      collectionName,
      destinationCharge: true,
    };

    const result = await createPurchaseWithAdmin(input);
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create purchase";
    console.error("[create-purchase] Error:", msg);

    if (msg.includes("CHECKOUT_SERVER_NOT_CONFIGURED")) {
      return NextResponse.json(
        {
          error:
            "Purchase could not be recorded. FIREBASE_SERVICE_ACCOUNT must be set on the server.",
        },
        { status: 503 }
      );
    }

    if (msg.includes("already been sold") && stripePaymentIntentIdForRecovery) {
      const recovered = await findPurchaseByPaymentIntent(stripePaymentIntentIdForRecovery).catch(
        () => null
      );
      if (recovered) {
        return NextResponse.json({ success: true, ...recovered });
      }
      return NextResponse.json(
        {
          error:
            "This item was just marked sold. If you were charged, check Purchases or Messages — your order may already exist.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
