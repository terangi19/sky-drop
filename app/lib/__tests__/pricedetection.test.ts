import { describe, it, expect } from "vitest";
import { detectSuspiciousPrice } from "../pricedetection";

describe("detectSuspiciousPrice", () => {
  it("returns false when no category provided", () => {
    expect(detectSuspiciousPrice(5)).toBe(false);
  });

  it("returns false for unknown category", () => {
    expect(detectSuspiciousPrice(1, "UnknownCategory")).toBe(false);
  });

  it("returns true when price is below category threshold", () => {
    expect(detectSuspiciousPrice(500, "Cars")).toBe(true);
    expect(detectSuspiciousPrice(10, "Tech")).toBe(true);
    expect(detectSuspiciousPrice(5, "Gaming")).toBe(true);
    expect(detectSuspiciousPrice(5000, "Property")).toBe(true);
  });

  it("returns false when price meets or exceeds threshold", () => {
    expect(detectSuspiciousPrice(1000, "Cars")).toBe(false);
    expect(detectSuspiciousPrice(5000, "Cars")).toBe(false);
    expect(detectSuspiciousPrice(50, "Tech")).toBe(false);
    expect(detectSuspiciousPrice(30, "Gaming")).toBe(false);
    expect(detectSuspiciousPrice(10000, "Property")).toBe(false);
  });

  it("handles edge cases at exact threshold", () => {
    expect(detectSuspiciousPrice(999, "Cars")).toBe(true);
    expect(detectSuspiciousPrice(1000, "Cars")).toBe(false);
  });

  it("works for all defined categories", () => {
    const categories = ["Cars", "Tech", "Gaming", "Fashion", "Home", "Sports", "Property", "Electronics", "Phones", "Clothing", "Books", "Jewellery", "Furniture"];
    for (const cat of categories) {
      expect(typeof detectSuspiciousPrice(0, cat)).toBe("boolean");
    }
  });
});
