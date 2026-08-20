import { describe, expect, it } from "vitest";
import { extractCompoundListingFacts } from "./awhina-pending-slots";
import { parseListingCondition } from "./awhina-listing-condition";
import {
  buildDescriptionWriterFacts,
  MARKETING_FILLER_RE,
  validateAiListingDescription,
  validateAiListingDescriptionResult,
} from "./awhina-description-writer";
import { finalizeAwhinaListingDescriptionAsync } from "./awhina-listing-composer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

const RICH_PHONE_ANSWER =
  "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs.";

const RICH_CONSOLE_ANSWER =
  "Like new, $550, Auckland. Comes with one controller and all cables. No faults or damage.";

const RICH_VEHICLE_ANSWER =
  "1999, 145,000 km, manual, petrol, silver, good used condition, $38,000, Auckland. Aftermarket exhaust, intake, coilovers and wheels. Recently serviced with new oil and filters. Tidy interior, a few stone chips on the front bumper, no known mechanical faults.";

describe("listing condition precedence", () => {
  it("maps like-new variants to Used - Like New before bare new", () => {
    expect(parseListingCondition("like-new")).toBe("Used - Like New");
    expect(parseListingCondition("like new")).toBe("Used - Like New");
    expect(parseListingCondition("like-new condition")).toBe("Used - Like New");
    expect(parseListingCondition("it's like new")).toBe("Used - Like New");
    expect(parseListingCondition("brand new")).toBe("New");
    expect(parseListingCondition("Factory sealed, box is in excellent condition")).toBe("New");
    expect(parseListingCondition("new")).toBe("New");
    expect(parseListingCondition("good used")).toBe("Used - Good");
  });
});

describe("rich seller evidence survives into public copy", () => {
  it("keeps like-new and phone evidence instead of a shallow location template", async () => {
    const extracted = extractCompoundListingFacts(RICH_PHONE_ANSWER, {
      activeSlot: "storage",
      baseDraft: {
        title: "Apple iPhone 15 Pro",
        listingType: "physical",
        extras: ["domain:electronics", "objectType:smartphone"],
      },
    });
    expect(extracted.partial.condition).toBe("Used - Like New");
    expect(extracted.partial.price).toBe("1250");
    expect(extracted.partial.location).toBe("Auckland");
    expect(String(extracted.partial.vehicleColour || extracted.partial.extras?.join(" "))).toMatch(
      /titanium/i
    );
    const fill: SkyAiListingFill = {
      title: "Apple iPhone 15 Pro",
      listingType: "physical",
      ...extracted.partial,
    };
    const facts = buildDescriptionWriterFacts(fill);
    expect(
      validateAiListingDescriptionResult(
        "iPhone 15 Pro in good used condition for sale in Auckland.",
        facts
      ).ok
    ).toBe(false);
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => null,
    });
    const description = String(written.description || "");
    expect(fill.condition).toBe("Used - Like New");
    expect(description).toMatch(/like[- ]new/i);
    expect(description).toMatch(/256\s*GB/i);
    expect(description).toMatch(/titanium/i);
    expect(description).toMatch(/94\s*%|battery/i);
    expect(description).toMatch(/box/i);
    expect(description).toMatch(/cable|usb/i);
    expect(description).toMatch(/case|protector/i);
    expect(description).toMatch(/crack|fault|repair/i);
    expect(description).toMatch(/auckland/i);
    expect(description).not.toMatch(/for sale in/i);
    expect((description.match(/no cracks/gi) || []).length).toBe(1);
    expect(description).not.toMatch(/battery health and No cracks/i);
    expect(description).not.toMatch(/Pickup locally[\s\S]*Located in/i);
    expect(description).not.toMatch(/256GB storage\.\s*Natural/i);
    expect(description).not.toMatch(/good used condition/i);
    expect(description).not.toMatch(MARKETING_FILLER_RE);
    expect(validateAiListingDescription(description, facts)).toBeTruthy();
  });

  it("keeps console accessories and fault disclosure", async () => {
    const extracted = extractCompoundListingFacts(RICH_CONSOLE_ANSWER, {
      activeSlot: "condition",
      baseDraft: {
        title: "Sony PlayStation 5",
        listingType: "physical",
        extras: ["domain:electronics", "objectType:console"],
      },
    });
    expect(extracted.partial.condition).toBe("Used - Like New");
    const fill: SkyAiListingFill = {
      title: "Sony PlayStation 5",
      listingType: "physical",
      ...extracted.partial,
    };
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => null,
    });
    const description = String(written.description || "");
    expect(description).toMatch(/controller/i);
    expect(description).toMatch(/cable/i);
    expect(description).toMatch(/fault|damage/i);
    expect(description).not.toMatch(/for sale in/i);
    expect(description).not.toMatch(/reliable gaming/i);
  });

  it("keeps vehicle evidence after a compound answer", async () => {
    const extracted = extractCompoundListingFacts(RICH_VEHICLE_ANSWER, {
      activeSlot: "year",
      baseDraft: {
        title: "Nissan Skyline",
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
      },
    });
    const fill: SkyAiListingFill = {
      title: "1999 Nissan Skyline",
      listingType: "vehicle",
      ...extracted.partial,
    };
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => null,
    });
    const description = String(written.description || "");
    expect(fill.vehicleYear).toBe("1999");
    expect(fill.vehicleTransmission).toBe("Manual");
    expect(description).toMatch(/exhaust/i);
    expect(description).toMatch(/oil|filter|servic/i);
    expect(description).toMatch(/stone chip/i);
    expect(description).toMatch(/fault/i);
  });

  it("replaces a shallow AI description once richer facts arrive", async () => {
    const sparse: SkyAiListingFill = {
      title: "Apple iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Good",
      location: "Auckland",
      description: "iPhone 15 Pro in good used condition for sale in Auckland.",
      descriptionSource: "ai",
    };
    const extracted = extractCompoundListingFacts(RICH_PHONE_ANSWER, {
      activeSlot: "storage",
      baseDraft: sparse,
    });
    const merged: SkyAiListingFill = {
      ...sparse,
      ...extracted.partial,
      extras: extracted.partial.extras,
    };
    const written = await finalizeAwhinaListingDescriptionAsync(merged, {
      force: true,
      writer: async () => null,
    });
    expect(String(written.description || "")).not.toMatch(/for sale in/i);
    expect(String(written.description || "")).toMatch(/256\s*GB/i);
    expect(String(written.description || "")).toMatch(/battery/i);
  });

  it.each([
    {
      name: "furniture",
      known: { title: "Oak Dining Table", listingType: "physical" },
      answer: "Solid oak, 180cm long, small scratch on top, pickup only, $400, Auckland.",
      must: [/oak/i, /180\s*cm/i, /scratch/i, /pickup/i],
    },
    {
      name: "clothing",
      known: { title: "Nike Air Max 90 Shoes", listingType: "physical" },
      answer: "Size 10, worn twice, original box, small mark on left shoe, $90.",
      must: [/size 10/i, /worn twice/i, /box/i, /mark/i],
    },
    {
      name: "trading card",
      known: {
        title: "Topps Chrome Card",
        listingType: "physical",
        extras: ["domain:trading_cards", "objectType:card"],
      },
      answer: "PSA 10, numbered 14/25, light corner wear, $120.",
      must: [/psa|10/i, /14\/25|numbered/i],
    },
    {
      name: "service",
      known: { title: "Lawn Mowing", listingType: "service" },
      answer: "Weekly lawns, $60 a visit, bring my own mower, Auckland.",
      must: [/mower|weekly|lawn/i],
    },
    {
      name: "rental",
      known: { title: "Trailer Hire", listingType: "rental", rentalSubType: "equipment" },
      answer: "$45 a day, bond $100, pickup in Hamilton, recently serviced.",
      must: [/servic/i],
    },
  ])("keeps $name seller facts in the description", async ({ known, answer, must }) => {
    const extracted = extractCompoundListingFacts(answer, {
      activeSlot: "condition",
      baseDraft: known,
    });
    const fill: SkyAiListingFill = { ...known, ...extracted.partial };
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => null,
    });
    const description = String(written.description || "");
    for (const pattern of must) {
      expect(description, description).toMatch(pattern);
    }
    expect(description).not.toMatch(/for sale in/i);
    expect(description).not.toMatch(MARKETING_FILLER_RE);
  });
});
