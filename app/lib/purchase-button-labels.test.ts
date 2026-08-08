import { describe, expect, it, afterEach } from "vitest";
import {
  paymentMethodSummary,
  primaryPurchaseLabel,
  purchaseButtonTitle,
  purchaseCheckoutAction,
} from "./purchase-button-labels";

describe("purchaseCheckoutAction", () => {
  const prevPublic = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    else process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = prevPublic;
  });

  it("MODE A: forces message when UI checkout flag is off", () => {
    delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    expect(purchaseCheckoutAction("stripe")).toBe("message");
    expect(purchaseCheckoutAction("contact")).toBe("message");
    expect(purchaseCheckoutAction(undefined)).toBe("message");
  });

  it("MODE B: opens arrange / stripe when UI checkout flag is on", () => {
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = "true";
    expect(purchaseCheckoutAction("contact")).toBe("arrange");
    expect(purchaseCheckoutAction(undefined)).toBe("stripe");
    expect(purchaseCheckoutAction(null)).toBe("stripe");
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");
  });
});

describe("purchase labels follow paymentType", () => {
  const prevPublic = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    else process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = prevPublic;
  });

  it("MODE A: messaging-first CTAs only when UI flag off", () => {
    delete process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED;
    expect(primaryPurchaseLabel({ paymentType: "stripe", price: "50" })).toMatch(/Message|Arrange/i);
    expect(primaryPurchaseLabel({ paymentType: "contact", price: "50" })).toMatch(/Message|Arrange/i);
    expect(purchaseButtonTitle("stripe")).not.toMatch(/Buy Now|Stripe Checkout/i);
  });

  it("MODE B: arrange copy for contact listings", () => {
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = "true";
    expect(primaryPurchaseLabel({ paymentType: "contact", price: "50" })).toContain("Contact Seller");
    expect(purchaseButtonTitle("contact")).toMatch(/bank transfer|cash|pickup/i);
    expect(paymentMethodSummary("contact")).toMatch(/contact seller/i);
  });

  it("MODE B: shows stripe copy for card checkout listings", () => {
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = "true";
    expect(primaryPurchaseLabel({ paymentType: "stripe", price: "50" })).toContain("Buy Now");
    expect(purchaseButtonTitle("stripe")).toMatch(/stripe|card/i);
    expect(paymentMethodSummary("stripe")).toMatch(/stripe/i);
  });

  it("MODE B: keeps Buy Now for stripe listings even with an old arrange request", () => {
    process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED = "true";
    expect(
      primaryPurchaseLabel({
        paymentType: "stripe",
        price: "78",
        hasExistingRequest: true,
      })
    ).toContain("Buy Now");
    expect(
      primaryPurchaseLabel({
        paymentType: "contact",
        price: "78",
        hasExistingRequest: true,
      })
    ).toBe("Open Chat");
  });
});
