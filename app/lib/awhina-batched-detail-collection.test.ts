import { describe, expect, it } from "vitest";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  extractCompoundListingFacts,
  getListingDetailBatch,
} from "./awhina-pending-slots";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearAllListingDraftCacheForTests } from "./awhina-listing-fill-tools";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";

type DetailCase = {
  name: string;
  known: SkyAiListingFill;
  response: string;
  expectQuestion: RegExp;
  assert: (partial: SkyAiListingFill) => void;
};

const CASES: DetailCase[] = [
  {
    name: "R34",
    known: { title: "Nissan Skyline R34", listingType: "vehicle", vehicleMake: "Nissan", vehicleModel: "Skyline", vehicleGeneration: "R34" },
    response: "1999, 145k km, manual, good condition, $38k, mostly stock except exhaust and wheels",
    expectQuestion: /year, mileage, transmission, condition, and asking price/i,
    assert: (p) => {
      expect(p.vehicleYear).toBe("1999");
      expect(p.vehicleOdometer).toBe("145000");
      expect(p.vehicleTransmission).toBe("Manual");
      expect(p.condition).toBe("Used - Good");
      expect(p.price).toBe("38000");
      expect(p.extras?.join(" ") || "").toMatch(/exhaust/i);
      expect(p.extras?.join(" ") || "").toMatch(/wheels/i);
    },
  },
  {
    name: "BMW 335i",
    known: { title: "BMW 335i E92 Coupe", listingType: "vehicle", vehicleMake: "BMW", vehicleModel: "335i", vehicleGeneration: "E92" },
    response: "2007, 120k km, automatic, good condition, $14k",
    expectQuestion: /year.*mileage.*transmission/i,
    assert: (p) => expect(p.vehicleYear).toBe("2007"),
  },
  {
    name: "iPhone",
    known: { title: "Apple iPhone 15 Pro", listingType: "physical", extras: ["domain:electronics", "objectType:smartphone"] },
    response: "256GB, black, good condition, 91% battery health, $1200",
    expectQuestion: /storage size, condition, colour/i,
    assert: (p) => {
      expect(p.extras).toContain("storage:256GB");
      expect(p.condition).toBe("Used - Good");
      expect(p.price).toBe("1200");
    },
  },
  {
    name: "DualSense",
    known: { title: "Sony DualSense Wireless Controller", listingType: "physical", extras: ["domain:electronics", "objectType:controller"] },
    response: "Midnight Black, good condition, $75",
    expectQuestion: /condition.*colour.*asking price/i,
    assert: (p) => expect(p.condition).toBe("Used - Good"),
  },
  {
    name: "mountain bike",
    known: { title: "Trek Marlin Mountain Bike", listingType: "physical", extras: ["domain:cycling", "objectType:mountain_bike"] },
    response: "Medium, good condition, recent maintenance, $650",
    expectQuestion: /condition.*asking price/i,
    assert: (p) => expect(p.extras?.join(" ") || "").toMatch(/maintenance|serviced/i),
  },
  {
    name: "Nike shoes",
    known: { title: "Nike Air Max 90 Shoes", listingType: "physical", extras: ["domain:clothing", "objectType:shoe"] },
    response: "Size 10, good condition, $90",
    expectQuestion: /size.*condition/i,
    assert: (p) => expect(p.extras).toContain("size:10"),
  },
  {
    name: "Riftbound booster display",
    known: { title: "Riftbound League of Legends Unleashed Booster Display", listingType: "physical", extras: ["domain:trading_cards", "objectType:booster_display", "set:Unleashed"] },
    response: "Factory sealed, box is in excellent condition, $240",
    expectQuestion: /factory sealed.*condition.*box/i,
    assert: (p) => expect(p.condition).toBe("New"),
  },
  {
    name: "Topps booster box",
    known: { title: "Topps Premier League Booster Box", listingType: "physical", extras: ["domain:trading_cards", "objectType:booster_box", "set:Premier League"] },
    response: "Sealed, box is clean, $130",
    expectQuestion: /factory sealed.*condition.*box/i,
    assert: (p) => expect(p.condition).toBe("New"),
  },
  {
    name: "LEGO set",
    known: { title: "LEGO Star Wars X-Wing Set", listingType: "physical", extras: ["domain:toys", "objectType:building_set"] },
    response: "Good condition, $85",
    expectQuestion: /condition.*asking price/i,
    assert: (p) => expect(p.price).toBe("85"),
  },
  {
    name: "Makita drill",
    known: { title: "Makita Cordless Drill", listingType: "physical", extras: ["domain:tools", "objectType:drill"] },
    response: "Good condition, recently serviced, $140",
    expectQuestion: /condition.*asking price/i,
    assert: (p) => expect(p.price).toBe("140"),
  },
];

describe("batched seller detail collection", () => {
  it.each(CASES)("$name asks one domain-relevant batch and harvests one response", ({ known, response, expectQuestion, assert }) => {
    const batch = getListingDetailBatch(known);
    expect(batch).not.toBeNull();
    expect(batch!.slots.length).toBeGreaterThanOrEqual(2);
    expect(batch!.slots.length).toBeLessThanOrEqual(5);
    expect(batch!.question).toMatch(expectQuestion);
    const extracted = extractCompoundListingFacts(response, {
      activeSlot: batch!.slots[0],
      baseDraft: known,
    });
    assert(extracted.partial);
  });

  it("does not re-ask known vehicle facts after a compound reply", () => {
    const known = CASES[0]!.known;
    const extracted = extractCompoundListingFacts(CASES[0]!.response, {
      activeSlot: "year",
      baseDraft: known,
    });
    const remaining = getListingDetailBatch({ ...known, ...extracted.partial, extras: extracted.partial.extras || known.extras });
    expect(remaining?.question || "").not.toMatch(/year|mileage|transmission|condition|asking price/i);
  });

  it("uses one R34 answer to update the draft atomically", () => {
    const id = "batched-r34";
    clearAllListingDraftCacheForTests();
    clearTaskScope(taskScopeKey({ conversationId: id }));
    const start = processCanonicalAwhina("list my r34", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(start.reply).toMatch(/year.*mileage.*transmission.*condition/i);

    const answered = processCanonicalAwhina(
      "1999, 145k km, manual, good condition, $38k, mostly stock except exhaust and wheels",
      {
        conversationId: id,
        pathname: "/post/ai",
        listingContext: start.listingFill as SkyAiListingFill,
      }
    );
    expect(answered.listingFill?.vehicleYear).toBe("1999");
    expect(answered.listingFill?.vehicleOdometer).toBe("145000");
    expect(answered.listingFill?.vehicleTransmission).toBe("Manual");
    expect(answered.listingFill?.condition).toBe("Used - Good");
    expect(answered.listingFill?.price).toBe("38000");
    expect(answered.reply).not.toMatch(/What's the year|mileage|transmission|condition|asking price/i);
  });
});
