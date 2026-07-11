import { describe, expect, it } from "vitest";
import {
  paymentMethodSummary,
  primaryPurchaseLabel,
  purchaseButtonTitle,
  purchaseCheckoutAction,
} from "./purchase-button-labels";

describe("purchaseCheckoutAction", () => {
  it("opens arrange flow for contact / Arrange Purchase listings", () => {
    expect(purchaseCheckoutAction("contact")).toBe("arrange");
    expect(purchaseCheckoutAction(undefined)).toBe("stripe");
    expect(purchaseCheckoutAction(null)).toBe("stripe");
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");
  });

  it("opens stripe checkout when paymentType is stripe", () => {
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");
  });

  it("reflects payment method changes in both directions", () => {
    // Arrange → Stripe
    expect(purchaseCheckoutAction("contact")).toBe("arrange");
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");

    // Stripe → Arrange
    expect(purchaseCheckoutAction("stripe")).toBe("stripe");
    expect(purchaseCheckoutAction("contact")).toBe("arrange");
  });
});

describe("purchase labels follow paymentType", () => {
  it("shows arrange copy for contact listings", () => {
    expect(primaryPurchaseLabel({ paymentType: "contact", price: "50" })).toContain("Contact Seller");
    expect(purchaseButtonTitle("contact")).toMatch(/bank transfer|cash|pickup/i);
    expect(paymentMethodSummary("contact")).toMatch(/contact seller/i);
  });

  it("shows stripe copy for card checkout listings", () => {
    expect(primaryPurchaseLabel({ paymentType: "stripe", price: "50" })).toContain("Buy Now");
    expect(purchaseButtonTitle("stripe")).toMatch(/stripe|card/i);
    expect(paymentMethodSummary("stripe")).toMatch(/stripe/i);
  });
});
