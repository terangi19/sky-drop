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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const { allowed } = rateLimit(`sponsor:${ip}`, 3, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const { listingId, listingTitle, sellerEmail, targetPage } = await req.json();
    if (!listingId || !sellerEmail || !targetPage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const s = getStripe();
    const paymentIntent = await s.paymentIntents.create({
      amount: 500,
      currency: "nzd",
      automatic_payment_methods: { enabled: true },
      metadata: { listingId, sellerEmail },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (e: any) {
    console.error("Sponsor drop intent error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
