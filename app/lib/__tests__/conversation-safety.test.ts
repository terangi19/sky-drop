import { describe, it, expect } from "vitest";
import {
  STAY_ON_SKY_DROP_HEADLINE,
  isStripeCheckoutPurchase,
  stayOnSkyDropReasons,
  arrangePurchaseChatFooter,
  arrangePurchaseBuyerReminder,
} from "../conversation-safety";

describe("isStripeCheckoutPurchase", () => {
  it('returns false for "contact" payment type', () => {
    expect(isStripeCheckoutPurchase("contact")).toBe(false);
  });

  it("returns true for other payment types", () => {
    expect(isStripeCheckoutPurchase("stripe")).toBe(true);
    expect(isStripeCheckoutPurchase("card")).toBe(true);
  });

  it("returns true for undefined/null", () => {
    expect(isStripeCheckoutPurchase(undefined)).toBe(true);
    expect(isStripeCheckoutPurchase(null)).toBe(true);
  });
});

describe("stayOnSkyDropReasons", () => {
  it('returns contact-specific reasons for "contact" payment type', () => {
    const reasons = stayOnSkyDropReasons("contact");
    expect(reasons).toHaveLength(4);
    expect(reasons[0]).toContain("price");
    expect(reasons[2]).toContain("Scammers");
  });

  it("returns Stripe-specific reasons for non-contact payment type", () => {
    const reasons = stayOnSkyDropReasons("stripe");
    expect(reasons).toHaveLength(4);
    expect(reasons[0]).toContain("Stripe");
  });

  it("returns Stripe reasons for undefined", () => {
    const reasons = stayOnSkyDropReasons(undefined);
    expect(reasons).toHaveLength(4);
    expect(reasons[0]).toContain("Stripe");
  });
});

describe("arrangePurchaseChatFooter", () => {
  it("includes the stay-on-platform headline", () => {
    const footer = arrangePurchaseChatFooter();
    expect(footer).toContain(STAY_ON_SKY_DROP_HEADLINE);
  });

  it("mentions payment, shipping, and timing", () => {
    const footer = arrangePurchaseChatFooter();
    expect(footer).toContain("Payment");
    expect(footer).toContain("Shipping or pickup");
    expect(footer).toContain("Timing");
  });
});

describe("arrangePurchaseBuyerReminder", () => {
  it("includes the headline", () => {
    const reminder = arrangePurchaseBuyerReminder();
    expect(reminder).toContain(STAY_ON_SKY_DROP_HEADLINE);
  });

  it("mentions disputes and 7 days", () => {
    const reminder = arrangePurchaseBuyerReminder();
    expect(reminder).toContain("dispute");
    expect(reminder).toContain("7 days");
  });
});
