import { describe, it, expect } from "vitest";
import { detectScam } from "../scamdetection";

describe("detectScam", () => {
  it("returns low severity for clean text", () => {
    const result = detectScam("Brand new iPhone for sale, local pickup available");
    expect(result.isScam).toBe(false);
    expect(result.severity).toBe("low");
    expect(result.keywords).toHaveLength(0);
  });

  it("detects a single scam keyword", () => {
    const result = detectScam("Please pay via bank transfer only");
    expect(result.isScam).toBe(true);
    expect(result.severity).toBe("medium");
    expect(result.keywords).toContain("bank transfer only");
  });

  it("detects multiple scam keywords with high severity", () => {
    const result = detectScam(
      "Send money first via western union, gift card accepted, urgent payment needed"
    );
    expect(result.isScam).toBe(true);
    expect(result.severity).toBe("high");
    expect(result.keywords.length).toBeGreaterThanOrEqual(3);
  });

  it("is case-insensitive", () => {
    const result = detectScam("BANK TRANSFER ONLY please");
    expect(result.isScam).toBe(true);
    expect(result.keywords).toContain("bank transfer only");
  });

  it("detects whatsapp keyword", () => {
    const result = detectScam("message me on whatsapp");
    expect(result.isScam).toBe(true);
    expect(result.keywords).toContain("whatsapp");
  });

  it("detects telegram keyword", () => {
    const result = detectScam("contact me on telegram for details");
    expect(result.isScam).toBe(true);
    expect(result.keywords).toContain("telegram");
  });

  it("detects crypto only", () => {
    const result = detectScam("I only accept crypto only for this item");
    expect(result.isScam).toBe(true);
    expect(result.keywords).toContain("crypto only");
  });

  it("returns medium severity for 1-2 keywords", () => {
    const result = detectScam("pay before viewing, no refunds");
    expect(result.severity).toBe("medium");
    expect(result.keywords.length).toBeGreaterThanOrEqual(1);
    expect(result.keywords.length).toBeLessThan(3);
  });
});
