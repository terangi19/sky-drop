import { describe, expect, it } from "vitest";
import {
  formatRefundAmount,
  formatRefundDate,
  getRefundDisplay,
  getRefundHeadline,
  isRefundedStatus,
  resolveRefundAmount,
} from "./refund-display";

describe("refund-display", () => {
  it("detects refunded status", () => {
    expect(isRefundedStatus("refunded")).toBe(true);
    expect(isRefundedStatus("delivered")).toBe(false);
  });

  it("prefers explicit refund amount over order total", () => {
    expect(resolveRefundAmount(42.5, 100)).toBe(42.5);
    expect(resolveRefundAmount(null, 100)).toBe(100);
  });

  it("formats refund amount and date", () => {
    expect(formatRefundAmount(25)).toBe("$25.00");
    expect(formatRefundDate({ seconds: 1710288000 })).toMatch(/2024/);
  });

  it("builds display labels for refund card", () => {
    const display = getRefundDisplay({
      refundAmount: 50,
      refundedAt: { seconds: 1710288000 },
      total: 51,
    });
    expect(display.amountLabel).toBe("$50.00");
    expect(display.refundedOn).toBeTruthy();
    expect(getRefundHeadline("buyer")).toBe("This order has been fully refunded.");
  });
});
