/**
 * Stripe Checkout feature flags for Sky Drop V1 messaging-first launch.
 *
 * STRIPE_CHECKOUT_ENABLED — server-only; sole authority for new listing charges.
 * NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED — UI visibility only; never authorize payments.
 *
 * When the server flag is unset or not exactly "true", listing checkout is disabled.
 */

export const V1_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Online checkout is not available in Sky Drop V1. Message the seller to arrange the purchase.";

function envTruthy(raw: string | undefined): boolean {
  return String(raw || "").trim().toLowerCase() === "true";
}

/** Server source of truth — never read NEXT_PUBLIC_* here. */
export function isStripeCheckoutEnabledServer(): boolean {
  return envTruthy(process.env.STRIPE_CHECKOUT_ENABLED);
}

/**
 * Client/UI visibility. Safe to call from client components.
 * Must not be used to authorize charges on the server.
 */
export function isStripeCheckoutVisibleClient(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED);
}

/** JSON body for fail-closed listing payment APIs. */
export function listingCheckoutUnavailableBody(): {
  error: string;
  code: "STRIPE_CHECKOUT_DISABLED";
  v1: true;
} {
  return {
    error: V1_CHECKOUT_UNAVAILABLE_MESSAGE,
    code: "STRIPE_CHECKOUT_DISABLED",
    v1: true,
  };
}
