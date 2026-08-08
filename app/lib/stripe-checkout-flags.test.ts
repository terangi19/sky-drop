import { describe, expect, it, afterEach } from "vitest";
import {
  isStripeCheckoutEnabledServer,
  isStripeCheckoutVisibleClient,
  isStripeCheckoutProductEnabled,
  listingCheckoutUnavailableBody,
  V1_CHECKOUT_UNAVAILABLE_MESSAGE,
} from "./stripe-checkout-flags";

describe("stripe-checkout-flags", () => {
  const prevServer = process.env.STRIPE_CHECKOUT_ENABLED;
  const prevPublic = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;

  afterEach(() => {
    if (prevServer === undefined) delete process.env.STRIPE_CHECKOUT_ENABLED;
    else process.env.STRIPE_CHECKOUT_ENABLED = prevServer;
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    else process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = prevPublic;
  });

  it("treats unset server flag as disabled", () => {
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    expect(isStripeCheckoutEnabledServer()).toBe(false);
  });

  it("enables only when server flag is exactly true", () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    expect(isStripeCheckoutEnabledServer()).toBe(true);
    process.env.STRIPE_CHECKOUT_ENABLED = "1";
    expect(isStripeCheckoutEnabledServer()).toBe(false);
    process.env.STRIPE_CHECKOUT_ENABLED = "false";
    expect(isStripeCheckoutEnabledServer()).toBe(false);
  });

  it("does not infer server auth from public flag", () => {
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = "true";
    expect(isStripeCheckoutEnabledServer()).toBe(false);
    expect(isStripeCheckoutVisibleClient()).toBe(true);
  });

  it("product capability follows server on server runtime", () => {
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    expect(isStripeCheckoutProductEnabled()).toBe(false);
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    expect(isStripeCheckoutProductEnabled()).toBe(true);
  });

  it("returns clear V1 unavailable body", () => {
    const body = listingCheckoutUnavailableBody();
    expect(body.error).toBe(V1_CHECKOUT_UNAVAILABLE_MESSAGE);
    expect(body.code).toBe("STRIPE_CHECKOUT_DISABLED");
  });
});
