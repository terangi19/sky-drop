import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import type { ServerDb } from "./firebase-admin";
import { getStripe } from "./stripe-server";
import { STRIPE_CONNECT_REQUIRED_MSG, type SellerProfileSlice } from "./seller-payments";

export type StripeKeyMode = "test" | "live";

export function getStripeKeyMode(): StripeKeyMode | null {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return null;
}

export function isStripeModeMismatchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /test mode.*live mode|live mode.*test mode/i.test(msg);
}

export async function verifyStripeConnectAccount(
  stripe: Stripe,
  accountId: string
): Promise<"valid" | "mode_mismatch" | "not_found" | "error"> {
  try {
    await stripe.accounts.retrieve(accountId);
    return "valid";
  } catch (err: unknown) {
    if (isStripeModeMismatchError(err)) return "mode_mismatch";
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e.code === "resource_missing" || e.statusCode === 404) return "not_found";
    if (/no such (account|destination)/i.test(e.message || "")) return "not_found";
    if (isStripeModeMismatchError(e.message)) return "mode_mismatch";
    return "error";
  }
}

export async function clearStripeConnectFromProfile(
  db: ServerDb,
  uid: string
): Promise<void> {
  await db.collection("profiles").doc(uid).set(
    {
      stripeAccountId: FieldValue.delete(),
      stripeConnectOnboarded: FieldValue.delete(),
      stripeAccountKeyMode: FieldValue.delete(),
    },
    { merge: true }
  );
}

export async function resolveStripeConnectAccount(
  db: ServerDb,
  uid: string,
  accountId: string | undefined | null,
  stripe?: Stripe
): Promise<{ connected: boolean; accountId?: string; modeMismatch?: boolean; cleared?: boolean }> {
  if (!accountId) return { connected: false };

  const s = stripe ?? getStripe();
  const status = await verifyStripeConnectAccount(s, accountId);

  if (status === "valid") {
    return { connected: true, accountId };
  }

  if (status === "mode_mismatch" || status === "not_found") {
    await clearStripeConnectFromProfile(db, uid);
    return { connected: false, modeMismatch: status === "mode_mismatch", cleared: true };
  }

  return { connected: false };
}

export async function stripeListingPublishErrorAsync(
  profile: SellerProfileSlice | null | undefined,
  stripe?: Stripe
): Promise<string | null> {
  if (!profile?.stripeAccountId) {
    return STRIPE_CONNECT_REQUIRED_MSG;
  }
  if (profile.restricted) {
    return "Your seller account is restricted — Stripe Checkout listings are not allowed.";
  }

  const s = stripe ?? getStripe();
  const status = await verifyStripeConnectAccount(s, profile.stripeAccountId);
  if (status === "valid") return null;

  if (status === "mode_mismatch") {
    return "Your Stripe account was connected in a different environment (test vs live). Reconnect in Profile → Payouts.";
  }

  return STRIPE_CONNECT_REQUIRED_MSG;
}
