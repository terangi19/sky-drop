import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { rateLimit } from "../../lib/rate-limit";

let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }
  return stripe;
}

let adminInitialized = false;

async function getAdminDB() {
  if (!adminInitialized) {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    if (!getApps().length) {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (sa) {
        initializeApp({ credential: cert(JSON.parse(sa)) });
      } else {
        initializeApp({ projectId: "sky-drop-de459" });
      }
    }
    adminInitialized = true;
  }
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore();
}

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

    const { title, price, listingId, imageUrl } = await req.json();
    if (!listingId || !price || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminDb = await getAdminDB();
    const listingRef = adminDb.collection("listings").doc(listingId);
    let listingSnap;
    try {
      listingSnap = await listingRef.get();
    } catch (e: any) {
      console.error("[create-payment-intent] Failed to read listing:", e?.code || e?.message || e);
      return NextResponse.json({ error: "Could not verify listing. Please try again." }, { status: 503 });
    }
    if (!listingSnap.exists) {
      return NextResponse.json({ error: "Listing not found." }, { status: 400 });
    }

    const listingData = listingSnap.data();
    if (!listingData) {
      return NextResponse.json({ error: "Listing data is empty." }, { status: 400 });
    }
    if (listingData.status === "sold") {
      return NextResponse.json({ error: "This listing is no longer available." }, { status: 400 });
    }

    if (listingData.expiresAt?.toMillis?.() < Date.now()) {
      return NextResponse.json({ error: "This listing has expired." }, { status: 400 });
    }

    if (typeof listingData.stockQuantity === "number" && listingData.stockQuantity <= 0) {
      return NextResponse.json({ error: "This item is out of stock." }, { status: 400 });
    }

    const amount = Math.round(Number(price) * 100);
    if (amount < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const listingPrice = Number(listingData.price);
    if (listingData.type !== "service" && Number(price) < listingPrice + 1.0) {
      return NextResponse.json({ error: "Payment amount is too low." }, { status: 400 });
    }
    if (listingData.type === "service" && Number(price) < 50) {
      return NextResponse.json({ error: "Payment amount is too low." }, { status: 400 });
    }

    const paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: "nzd",
      description: `Sky Drop: ${title}`,
      metadata: { listingId, title },
      automatic_payment_methods: { enabled: true },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    console.error("Stripe error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
