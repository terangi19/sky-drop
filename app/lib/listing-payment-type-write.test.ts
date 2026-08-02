import { describe, expect, it, afterEach } from "vitest";
import { resolveListingPaymentTypeForWrite } from "./listing-payment-type-write";

describe("resolveListingPaymentTypeForWrite", () => {
  const prev = process.env.STRIPE_CHECKOUT_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.STRIPE_CHECKOUT_ENABLED;
    else process.env.STRIPE_CHECKOUT_ENABLED = prev;
  });

  it("forces contact when server checkout is disabled even if client sends stripe", () => {
    delete process.env.STRIPE_CHECKOUT_ENABLED;
    expect(resolveListingPaymentTypeForWrite("stripe")).toBe("contact");
    expect(resolveListingPaymentTypeForWrite(undefined)).toBe("contact");
  });

  it("allows stripe only when server flag is true", () => {
    process.env.STRIPE_CHECKOUT_ENABLED = "true";
    expect(resolveListingPaymentTypeForWrite("stripe")).toBe("stripe");
    expect(resolveListingPaymentTypeForWrite("contact")).toBe("contact");
  });
});
