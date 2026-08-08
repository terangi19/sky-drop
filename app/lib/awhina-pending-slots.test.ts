import { describe, expect, it } from "vitest";
import {
  parseShortReplyForPendingSlot,
  detectSellDomain,
  computeMissingListingSlots,
  nextListingSlotQuestion,
} from "./awhina-pending-slots";

describe("pending slot short-reply parsing", () => {
  it("does not treat 128gb as price", () => {
    const r = parseShortReplyForPendingSlot("128gb", "price");
    expect(r.rejectedCorruption).toBe(true);
    expect(r.matched).toBe(false);
  });

  it("fills storage when storage slot pending", () => {
    const r = parseShortReplyForPendingSlot("128GB", "storage");
    expect(r.matched).toBe(true);
    expect(r.filledSlot).toBe("storage");
    expect(r.partial.extras?.some((e) => /128GB/i.test(e))).toBe(true);
  });

  it("does not treat PSA 10 as price", () => {
    const r = parseShortReplyForPendingSlot("PSA 10", "price");
    expect(r.rejectedCorruption).toBe(true);
  });

  it("fills grade when grade slot pending", () => {
    const r = parseShortReplyForPendingSlot("PSA 10", "grade");
    expect(r.matched).toBe(true);
    expect(r.filledSlot).toBe("grade");
  });

  it("treats bare year as year not price when year pending", () => {
    const r = parseShortReplyForPendingSlot("2014", "year");
    expect(r.matched).toBe(true);
    expect(r.filledSlot).toBe("year");
    expect(r.partial.vehicleYear).toBe("2014");
  });

  it("treats 140k as odometer when odometer pending", () => {
    const r = parseShortReplyForPendingSlot("140k", "odometer");
    expect(r.matched).toBe(true);
    expect(r.filledSlot).toBe("odometer");
  });

  it("fills price when price pending and bare dollars", () => {
    const r = parseShortReplyForPendingSlot("900", "price");
    expect(r.matched).toBe(true);
    expect(r.filledSlot).toBe("price");
    expect(String(r.partial.price)).toMatch(/900/);
  });
});

describe("sell domain + slot priority", () => {
  it("detects vehicle and lists year among missing when sparse", () => {
    const fill = {
      listingType: "vehicle" as const,
      vehicleMake: "Nissan",
      vehicleModel: "Skyline",
      title: "Nissan Skyline",
    };
    expect(detectSellDomain(fill)).toBe("vehicle");
    const missing = computeMissingListingSlots(fill);
    expect(missing).toContain("year");
    const next = nextListingSlotQuestion(fill);
    expect(next?.slot).toBeTruthy();
  });
});
