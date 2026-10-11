import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSellerForCheckout } from "./seller-payments";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("OfferPaymentModal: no rule-denied client profiles query", () => {
  const src = read("app/components/OfferPaymentModal.tsx");
  const cont = src.slice(src.indexOf("async function handleContinue"), src.indexOf("async function handlePaymentSuccess"));

  it("does not query profiles by email (profiles is owner-only; the query was always denied)", () => {
    expect(src).not.toMatch(/collection\(db,\s*"profiles"\)/);
    expect(src).not.toMatch(/where\("email"/);
    expect(src).not.toMatch(/\bgetDocs\b/);
    expect(src).not.toContain("calculateTrustScore");
  });

  it("still validates the listing and then asks the server for the payment intent", () => {
    expect(cont).toContain('getDoc(doc(db, "listings", listingId))');
    expect(cont).toContain("isListingAvailableForPurchase(listingData)");
    expect(cont).toContain('fetch("/api/create-payment-intent"');
    expect(cont.indexOf("isListingAvailableForPurchase")).toBeLessThan(cont.indexOf("/api/create-payment-intent"));
  });
});

describe("/api/create-payment-intent re-checks the seller server-side", () => {
  const route = read("app/api/create-payment-intent/route.ts");
  it("loads the seller profile with the Admin SDK and validates it before creating the intent", () => {
    const validate = route.indexOf("validateSellerForCheckout(sellerProfile)");
    expect(route).toContain("adminGetSellerProfileByEmail(sellerEmail)");
    expect(validate).toBeGreaterThan(0);
    expect(validate).toBeLessThan(route.indexOf("paymentIntents.create"));
  });

  it("validateSellerForCheckout rejects restricted / unverified / no-payout sellers (no trust-score check)", () => {
    expect(validateSellerForCheckout(null)).toMatch(/payouts/);
    expect(validateSellerForCheckout({ restricted: true, stripeAccountId: "acct_1" })).toMatch(/restricted/);
    expect(validateSellerForCheckout({ emailVerified: false, stripeAccountId: "acct_1" })).toMatch(/verified/);
    expect(validateSellerForCheckout({ emailVerified: true })).toMatch(/payouts/);
    expect(validateSellerForCheckout({ emailVerified: true, stripeAccountId: "acct_1" })).toBeNull();
  });
});

describe("the modal is only reachable when the Stripe UI flag is literally 'true'", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("messages page renders OfferPaymentModal behind stripeCheckoutVisible", () => {
    const page = read("app/messages/page.tsx");
    expect(page).toMatch(/\{stripeCheckoutVisible && pendingPayment && \(\s*<OfferPaymentModal/);
    expect(page).toContain("const stripeCheckoutVisible = isStripeCheckoutVisibleClient();");
  });

  it.each([
    [undefined, false],
    ["false", false],
    ["1", false],
    ["TRUE", false],
    ["true", true],
  ])("NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=%s -> visible %s", async (value, expected) => {
    if (value === undefined) vi.stubEnv("NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED", undefined as unknown as string);
    else vi.stubEnv("NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED", value);
    const { isStripeCheckoutVisibleClient } = await import("./stripe-checkout-flags");
    expect(isStripeCheckoutVisibleClient()).toBe(expected);
  });
});
