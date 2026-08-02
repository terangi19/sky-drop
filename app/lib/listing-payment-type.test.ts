import { describe, expect, it } from "vitest";
import {
  isContactPaymentType,
  isStripePaymentType,
  normalizePaymentType,
} from "./listing-payment-type";

describe("normalizePaymentType", () => {
  it("only treats exact stripe as stripe", () => {
    expect(normalizePaymentType("stripe")).toBe("stripe");
    expect(normalizePaymentType("Stripe")).toBe("stripe");
  });

  it("defaults missing/unknown values to contact", () => {
    expect(normalizePaymentType(undefined)).toBe("contact");
    expect(normalizePaymentType(null)).toBe("contact");
    expect(normalizePaymentType("")).toBe("contact");
    expect(normalizePaymentType("arrange")).toBe("contact");
    expect(normalizePaymentType("contact")).toBe("contact");
  });

  it("exposes helpers consistently", () => {
    expect(isStripePaymentType("stripe")).toBe(true);
    expect(isContactPaymentType("stripe")).toBe(false);
    expect(isContactPaymentType(undefined)).toBe(true);
  });
});
