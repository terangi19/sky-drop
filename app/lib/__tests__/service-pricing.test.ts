import { describe, it, expect } from "vitest";
import {
  normalizeServicePricingType,
  servicePriceRequired,
  offersDisabledForService,
  formatServicePriceDisplay,
  getServicePricingBadge,
  getServicePrimaryCta,
  getServiceBuyerAction,
} from "../service-pricing";

describe("normalizeServicePricingType", () => {
  it("returns valid types as-is", () => {
    expect(normalizeServicePricingType("fixed")).toBe("fixed");
    expect(normalizeServicePricingType("starting_at")).toBe("starting_at");
    expect(normalizeServicePricingType("request_quote")).toBe("request_quote");
  });

  it('normalizes "starting_from" to "starting_at"', () => {
    expect(normalizeServicePricingType("starting_from")).toBe("starting_at");
  });

  it('defaults to "fixed" when price is provided and type is unknown', () => {
    expect(normalizeServicePricingType(null, "100")).toBe("fixed");
    expect(normalizeServicePricingType(undefined, 50)).toBe("fixed");
  });

  it('defaults to "request_quote" when no price and unknown type', () => {
    expect(normalizeServicePricingType(null, null)).toBe("request_quote");
    expect(normalizeServicePricingType(undefined)).toBe("request_quote");
    expect(normalizeServicePricingType("unknown", "")).toBe("request_quote");
  });
});

describe("servicePriceRequired", () => {
  it("returns true for fixed and starting_at", () => {
    expect(servicePriceRequired("fixed")).toBe(true);
    expect(servicePriceRequired("starting_at")).toBe(true);
  });

  it("returns false for request_quote", () => {
    expect(servicePriceRequired("request_quote")).toBe(false);
  });
});

describe("offersDisabledForService", () => {
  it("returns true for request_quote pricing", () => {
    expect(offersDisabledForService("request_quote")).toBe(true);
  });

  it("returns false for fixed pricing", () => {
    expect(offersDisabledForService("fixed")).toBe(false);
  });

  it("returns true when type is null (defaults to request_quote)", () => {
    expect(offersDisabledForService(null)).toBe(true);
  });
});

describe("formatServicePriceDisplay", () => {
  it('returns "Quote Required" for request_quote', () => {
    expect(formatServicePriceDisplay({ servicePricingType: "request_quote" })).toBe("Quote Required");
  });

  it("returns price with dollar sign for fixed", () => {
    expect(formatServicePriceDisplay({ price: "100", servicePricingType: "fixed" })).toBe("$100");
  });

  it('returns "Starting At — $X" for starting_at with price', () => {
    expect(
      formatServicePriceDisplay({ price: "50", servicePricingType: "starting_at" })
    ).toBe("Starting At — $50");
  });

  it('returns "Price on request" for starting_at without price', () => {
    expect(
      formatServicePriceDisplay({ servicePricingType: "starting_at" })
    ).toBe("Price on request");
  });

  it('returns "Contact for price" for fixed without price', () => {
    expect(
      formatServicePriceDisplay({ servicePricingType: "fixed" })
    ).toBe("Contact for price");
  });
});

describe("getServicePricingBadge", () => {
  it("returns violet tone for request_quote", () => {
    const badge = getServicePricingBadge({ servicePricingType: "request_quote" });
    expect(badge.tone).toBe("violet");
    expect(badge.label).toBe("Quote Required");
  });

  it("returns sky tone for starting_at", () => {
    const badge = getServicePricingBadge({ price: "80", servicePricingType: "starting_at" });
    expect(badge.tone).toBe("sky");
    expect(badge.label).toBe("Starting At");
    expect(badge.detail).toBe("— $80");
  });

  it("returns emerald tone for fixed", () => {
    const badge = getServicePricingBadge({ price: "200", servicePricingType: "fixed" });
    expect(badge.tone).toBe("emerald");
    expect(badge.label).toBe("Fixed Price");
    expect(badge.detail).toBe("— $200");
  });
});

describe("getServicePrimaryCta", () => {
  it('returns "Purchase Service" for fixed', () => {
    expect(getServicePrimaryCta("fixed", "100")).toBe("Purchase Service");
  });

  it('returns "Discuss Project" for starting_at', () => {
    expect(getServicePrimaryCta("starting_at", "50")).toBe("Discuss Project");
  });

  it('returns "Request Quote" for request_quote', () => {
    expect(getServicePrimaryCta("request_quote")).toBe("Request Quote");
  });
});

describe("getServiceBuyerAction", () => {
  it('returns "checkout" for fixed with price and stripe payment', () => {
    expect(getServiceBuyerAction("fixed", "100", "stripe")).toBe("checkout");
  });

  it('returns "inquiry" for fixed without stripe', () => {
    expect(getServiceBuyerAction("fixed", "100", "contact")).toBe("inquiry");
  });

  it('returns "inquiry" for request_quote', () => {
    expect(getServiceBuyerAction("request_quote", null, "stripe")).toBe("inquiry");
  });

  it('returns "inquiry" for starting_at', () => {
    expect(getServiceBuyerAction("starting_at", "50", "stripe")).toBe("inquiry");
  });
});
