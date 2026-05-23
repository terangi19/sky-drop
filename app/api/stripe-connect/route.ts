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
    const { allowed } = rateLimit(`stripe-connect:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { action, accountId, email, amount } = body;
    const s = getStripe();

    if (action === "create") {
      const account = await s.accounts.create({
        type: "express",
        email,
        capabilities: { transfers: { requested: true } },
      });
      return NextResponse.json({ accountId: account.id });
    }

    if (action === "onboard") {
      const link = await s.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/profile`,
        return_url: `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/profile`,
        type: "account_onboarding",
      });
      return NextResponse.json({ url: link.url });
    }

    if (action === "withdraw") {
      const transfer = await s.transfers.create({
        amount: Math.round(Number(amount) * 100),
        currency: "nzd",
        destination: accountId,
      });
      return NextResponse.json({ success: true, id: transfer.id });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Stripe Connect error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
