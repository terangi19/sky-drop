import { loadStripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!key) {
  console.error("Stripe publishable key is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment.");
}

const stripePromise = key ? loadStripe(key) : Promise.resolve(null);

export default stripePromise;
