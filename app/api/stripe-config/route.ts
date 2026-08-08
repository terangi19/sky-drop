import { NextResponse } from "next/server";
import {
  isStripeCheckoutEnabledServer,
  listingCheckoutUnavailableBody,
} from "../../lib/stripe-checkout-flags";

/** Public Stripe publishable key — safe to expose; used when client bundle lacks NEXT_PUBLIC_* in dev. */
export async function GET() {
  if (!isStripeCheckoutEnabledServer()) {
    return NextResponse.json(listingCheckoutUnavailableBody(), { status: 503 });
  }
  const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
  if (!publishableKey) {
    return NextResponse.json({ error: "Stripe publishable key not configured" }, { status: 503 });
  }
  return NextResponse.json(
    { publishableKey },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
