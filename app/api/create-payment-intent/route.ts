import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "../../lib/stripe-server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`payment:${ip}`, 10, 60_000);
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

    const { title, price, listingId } = await req.json();
    if (!listingId || !price || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const amount = Math.round(Number(price) * 100);
    if (amount < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Server-side listing verification (skipped in dev when admin DB not available)
    if (isAdminInitialized()) {
      const listingDoc = await getAdminDb().collection("listings").doc(listingId).get();
      if (!listingDoc.exists) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      const listingData = listingDoc.data()!;
      if (listingData.status === "sold") {
        return NextResponse.json({ error: "This listing has already sold" }, { status: 400 });
      }
      if (listingData.expiresAt?.toMillis?.() < Date.now()) {
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

      // Seller trust check
      const sellerProfiles = await getAdminDb().collection("profiles").where("email", "==", listingData.sellerEmail).limit(1).get();
      if (!sellerProfiles.empty) {
        const sellerProfile = sellerProfiles.docs[0].data();
        if (sellerProfile.restricted) {
          return NextResponse.json({ error: "This seller is restricted." }, { status: 403 });
        }
        if (!sellerProfile.emailVerified) {
          return NextResponse.json({ error: "Seller has not verified their email." }, { status: 403 });
        }
      }
    }

    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: Math.round(Number(price) * 100),
        currency: "nzd",
        description: `Sky Drop: ${title}`,
        metadata: { listingId, title, buyerUid: decodedToken.uid, buyerEmail: decodedToken.email || "" },
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
