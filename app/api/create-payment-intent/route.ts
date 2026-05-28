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

    const amount = Math.round(Number(price) * 100);
    if (amount < 50) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
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
    console.error("[create-payment-intent] Error:", err?.code || err?.message || err);
    return NextResponse.json({ error: "Payment could not be processed. Please try again." }, { status: 500 });
  }
}
