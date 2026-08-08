import { describe, expect, it } from "vitest";
import {
  parseShortReplyForPendingSlot,
  detectSellDomain,
  computeMissingListingSlots,
  nextListingSlotQuestion,
  extractCompoundListingFacts,
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

describe("extractCompoundListingFacts multi-field", () => {
  it("PS5: 200 new auckland → price + New + Auckland", () => {
    const r = extractCompoundListingFacts("200 new auckland", {
      activeSlot: "condition",
      baseDraft: { title: "PS5", listingType: "physical" },
    });
    expect(r.partial.price).toBe("200");
    expect(r.partial.condition).toBe("New");
    expect(r.partial.location).toBe("Auckland");
    expect(r.filledSlots).toEqual(
      expect.arrayContaining(["price", "condition", "location"])
    );
  });

  it("phone: 256gb used 900 hamilton", () => {
    const r = extractCompoundListingFacts("256gb used 900 hamilton", {
      activeSlot: "storage",
      baseDraft: { title: "iPhone 14", listingType: "physical", category: "Tech" },
    });
    expect(r.partial.price).toBe("900");
    expect(String(r.partial.condition || "")).toMatch(/Used/i);
    expect(r.partial.location).toBe("Hamilton");
    expect((r.partial.extras || []).join(" ")).toMatch(/256GB/i);
  });

  it("vehicle: 1999 190k manual black 50k auckland", () => {
    const r = extractCompoundListingFacts("1999 190k manual black 50k auckland", {
      activeSlot: "year",
      baseDraft: {
        title: "Toyota Corolla",
        listingType: "vehicle",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
      },
    });
    expect(r.partial.vehicleYear).toBe("1999");
    expect(r.partial.vehicleOdometer).toBe("190000");
    expect(r.partial.vehicleTransmission).toBe("Manual");
    expect(r.partial.vehicleColour).toBe("Black");
    expect(r.partial.price).toBe("50000");
    expect(r.partial.location).toBe("Auckland");
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
