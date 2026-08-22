import { describe, expect, it } from "vitest";
import { extractCompoundListingFacts } from "./awhina-pending-slots";
import {
  buildDescriptionWriterFacts,
  MARKETING_FILLER_RE,
  validateAiListingDescription,
} from "./awhina-description-writer";
import { finalizeAwhinaListingDescriptionAsync } from "./awhina-listing-composer";
import { shouldUseSafeDescriptionMode } from "./awhina-description-safe-mode";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  groupedSellerEvidenceFromExtras,
  harvestSellerEvidence,
} from "./awhina-seller-evidence";

export const EXACT_R34_SELLER_ANSWER =
  "1999 Nissan Skyline R34, 145,000 km, manual, good used condition, asking $38,000. Gunmetal grey, located in Auckland. Aftermarket exhaust, intake, coilovers and 18-inch wheels. Recently serviced with fresh engine oil and filters. Interior is tidy, paint has a few minor stone chips and age-related marks. No known mechanical faults and it starts and drives well. WOF and rego are current.";

const CROSS_DOMAIN: Array<{
  name: string;
  known: SkyAiListingFill;
  answer: string;
  extras: RegExp[];
  description: RegExp[];
}> = [
  {
    name: "iPhone",
    known: {
      title: "Apple iPhone 15 Pro",
      listingType: "physical",
      extras: ["domain:electronics", "objectType:smartphone"],
    },
    answer: "256GB, 91% battery health, tiny scratch near camera, comes with box and charger.",
    extras: [/256GB/i, /91% battery health/i, /scratch/i, /box|charger/i],
    description: [/256GB|256 gb/i, /91%|battery health/i, /scratch/i, /box|charger/i],
  },
  {
    name: "mountain bike",
    known: {
      title: "Trek Marlin Mountain Bike",
      listingType: "physical",
      extras: ["domain:cycling", "objectType:mountain_bike"],
    },
    answer: "Recently serviced, new chain, upgraded brakes, scratch on frame.",
    extras: [/servic/i, /chain/i, /brakes/i, /scratch/i],
    description: [/servic/i, /chain/i, /brakes/i, /scratch/i],
  },
  {
    name: "Nike shoes",
    known: {
      title: "Nike Air Max 90 Shoes",
      listingType: "physical",
      extras: ["domain:clothing", "objectType:shoe"],
    },
    answer: "Size 10, worn twice, original box, small mark on left shoe.",
    extras: [/size:10/i, /worn twice/i, /original box/i, /mark on left/i],
    description: [/size 10|size:10/i, /worn twice/i, /box/i, /mark/i],
  },
  {
    name: "booster box",
    known: {
      title: "Topps Premier League Booster Box",
      listingType: "physical",
      extras: ["domain:trading_cards", "objectType:booster_box", "set:Premier League"],
    },
    answer: "Factory sealed, small dent on one corner, bought from Hobby Zone.",
    extras: [/factory sealed/i, /dent/i, /hobby zone/i],
    description: [/sealed/i, /dent/i, /hobby zone/i],
  },
  {
    name: "furniture",
    known: {
      title: "Oak Dining Table",
      listingType: "physical",
      extras: ["domain:furniture", "objectType:table"],
    },
    answer: "Solid oak, 180cm long, small scratch on top, pickup only.",
    extras: [/solid oak/i, /180\s*cm/i, /scratch/i, /pickup only/i],
    description: [/oak/i, /180\s*cm/i, /scratch/i, /pickup/i],
  },
  {
    name: "power tool",
    known: {
      title: "Makita Cordless Drill",
      listingType: "physical",
      extras: ["domain:tools", "objectType:drill"],
    },
    answer: "Recently serviced, two batteries, small scratch on the chuck, pickup only.",
    extras: [/servic/i, /batter/i, /scratch/i, /pickup only/i],
    description: [/servic/i, /batter/i, /scratch/i, /pickup/i],
  },
];

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function descriptionFromWriterFacts(facts: ReturnType<typeof buildDescriptionWriterFacts>): string {
  const vehicle = facts.vehicle || {};
  const identity = [vehicle.year, facts.title].filter(Boolean).join(" ").trim() || facts.title;
  const bits: string[] = [];
  const spec: string[] = [];
  if (vehicle.transmission) spec.push(`a ${vehicle.transmission.toLowerCase()} transmission`);
  if (vehicle.odometer) spec.push(`${Number(vehicle.odometer).toLocaleString("en-NZ")} km`);
  bits.push(
    spec.length
      ? `${identity} with ${joinAnd(spec)}.`
      : `${identity}${facts.condition ? ` in good used condition` : ""}.`
  );
  if (vehicle.colour && facts.condition) {
    bits.push(
      `Finished in ${vehicle.colour.toLowerCase()} and presented in good used condition.`
    );
  } else if (facts.condition && /used/i.test(facts.condition)) {
    bits.push(`This listing is in good used condition.`);
  } else if (facts.condition && /^new$/i.test(facts.condition)) {
    bits.push(`${identity} is brand new.`);
  }
  const evidence = facts.sellerEvidence || {};
  const modifications = (evidence.modifications as string[]) || [];
  const maintenance = (evidence.maintenance as string[]) || [];
  const conditionDetails = (evidence.conditionDetails as string[]) || [];
  const mechanical = (evidence.mechanical as string[]) || [];
  const compliance = (evidence.compliance as string[]) || [];
  const included = (evidence.included as string[]) || [];
  const notes = (evidence.notes as string[]) || [];
  if (modifications.length) bits.push(`Fitted with ${joinAnd(modifications)}.`);
  for (const item of maintenance) bits.push(/[.!?]$/.test(item) ? item : `${item}.`);
  for (const item of conditionDetails) bits.push(/[.!?]$/.test(item) ? item : `${item}.`);
  if (mechanical.length) bits.push(`${joinAnd(mechanical)}.`);
  if (compliance.length) {
    const blob = compliance.join(" ").toLowerCase();
    bits.push(
      /\bwof\b/.test(blob) && /\b(rego|registration)\b/.test(blob)
        ? "WOF and registration are current."
        : `${joinAnd(compliance)}.`
    );
  }
  for (const item of included) bits.push(/[.!?]$/.test(item) ? item : `${item}.`);
  for (const item of notes) bits.push(/[.!?]$/.test(item) ? item : `${item}.`);
  const location =
    (typeof evidence.location === "string" && evidence.location) || facts.location;
  if (location) bits.push(`Located in ${location}.`);
  if (facts.product?.storage && !bits.join(" ").includes(facts.product.storage)) {
    bits.splice(1, 0, `It has ${facts.product.storage} storage.`);
  }
  if (facts.product?.size && !bits.join(" ").toLowerCase().includes(`size ${facts.product.size}`.toLowerCase())) {
    bits.splice(1, 0, `Size ${facts.product.size}.`);
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

describe("rich seller evidence preservation", () => {
  it("extracts the exact R34 seller message into structured extras", () => {
    const extracted = extractCompoundListingFacts(EXACT_R34_SELLER_ANSWER, {
      activeSlot: "year",
      baseDraft: {
        title: "Nissan Skyline R34",
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
      },
    });
    const harvested = harvestSellerEvidence(EXACT_R34_SELLER_ANSWER, {
      title: "Nissan Skyline R34",
      colour: extracted.partial.vehicleColour,
      location: extracted.partial.location,
    });
    expect(extracted.partial.vehicleYear).toBe("1999");
    expect(extracted.partial.vehicleOdometer).toBe("145000");
    expect(extracted.partial.vehicleTransmission).toBe("Manual");
    expect(extracted.partial.condition).toBe("Used - Good");
    expect(extracted.partial.price).toBe("38000");
    expect(extracted.partial.location).toBe("Auckland");
    expect(extracted.partial.vehicleColour).toMatch(/Gunmetal grey/i);
    const extras = extracted.partial.extras || [];
    const blob = extras.join(" | ");
    expect(blob).toMatch(/modification:aftermarket exhaust/i);
    expect(blob).toMatch(/modification:intake/i);
    expect(blob).toMatch(/modification:coilovers/i);
    expect(blob).toMatch(/modification:18-inch wheels/i);
    expect(blob).toMatch(/maintenance:.*oil/i);
    expect(blob).toMatch(/conditionDetail:.*tidy/i);
    expect(blob).toMatch(/stone chips/i);
    expect(blob).toMatch(/mechanical:no known mechanical faults/i);
    expect(blob).toMatch(/mechanical:starts and drives well/i);
    expect(blob).toMatch(/compliance:WOF current/i);
    expect(blob).toMatch(/compliance:registration current/i);
    expect(harvested.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "modification",
        "maintenance",
        "conditionDetail",
        "mechanical",
        "compliance",
      ])
    );
  });

  it("passes those extras to the description writer as sellerEvidence", () => {
    const extracted = extractCompoundListingFacts(EXACT_R34_SELLER_ANSWER, {
      activeSlot: "year",
      baseDraft: {
        title: "Nissan Skyline R34",
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
      },
    });
    const fill: SkyAiListingFill = {
      title: "1999 Nissan Skyline R34",
      listingType: "vehicle",
      ...extracted.partial,
    };
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts.vehicle).toMatchObject({
      year: "1999",
      odometer: "145000",
      transmission: "Manual",
    });
    expect(facts.location).toBe("Auckland");
    expect(facts.sellerEvidence).toMatchObject({
      modifications: expect.arrayContaining([
        expect.stringMatching(/aftermarket exhaust/i),
        expect.stringMatching(/intake/i),
        expect.stringMatching(/coilover/i),
        expect.stringMatching(/18-inch wheels/i),
      ]),
      location: "Auckland",
    });
    expect(JSON.stringify(facts.sellerEvidence)).toMatch(/fresh engine oil|filters/i);
    expect(JSON.stringify(facts.sellerEvidence)).toMatch(/tidy|stone chips|age-related/i);
    expect(JSON.stringify(facts.sellerEvidence)).toMatch(/no known mechanical faults/i);
    expect(JSON.stringify(facts.sellerEvidence)).toMatch(/WOF current/i);
    expect(JSON.stringify(facts.extras.join(" "))).not.toMatch(/modification:/i);
  });

  it("writes a rich R34 description from seller evidence and rejects classic-era filler", async () => {
    const extracted = extractCompoundListingFacts(EXACT_R34_SELLER_ANSWER, {
      activeSlot: "year",
      baseDraft: {
        title: "Nissan Skyline R34",
        listingType: "vehicle",
        vehicleMake: "Nissan",
        vehicleModel: "Skyline",
        vehicleGeneration: "R34",
      },
    });
    const fill: SkyAiListingFill = {
      title: "1999 Nissan Skyline R34",
      listingType: "vehicle",
      ...extracted.partial,
    };
    const facts = buildDescriptionWriterFacts(fill);
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async (writerFacts) =>
        JSON.stringify({ description: descriptionFromWriterFacts(writerFacts) }),
    });
    const fallback = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async () => null,
    });
    const description = String(written.description || "");
    expect(description).toMatch(/aftermarket exhaust/i);
    expect(description).toMatch(/intake/i);
    expect(description).toMatch(/coilover/i);
    expect(description).toMatch(/18-inch wheels/i);
    expect(description).toMatch(/oil|filter|servic/i);
    expect(description).toMatch(/tidy/i);
    expect(description).toMatch(/stone chips/i);
    expect(description).toMatch(/no known mechanical faults/i);
    expect(description).toMatch(/starts and drives well/i);
    expect(description).toMatch(/wof/i);
    expect(description).toMatch(/registration/i);
    expect(description).toMatch(/auckland/i);
    expect(description).not.toMatch(MARKETING_FILLER_RE);
    expect(description).not.toMatch(/classic era of nissan performance/i);
    if (!shouldUseSafeDescriptionMode()) {
      expect(validateAiListingDescription(description, facts)).toBeTruthy();
    } else {
      expect(description.length).toBeGreaterThan(80);
    }
    expect(String(fallback.description || "")).toMatch(/exhaust/i);
    expect(String(fallback.description || "")).toMatch(/auckland/i);
    expect(groupedSellerEvidenceFromExtras(fill.extras).modifications.length).toBeGreaterThanOrEqual(3);
  });

  it.each(CROSS_DOMAIN)("keeps $name seller evidence in the public description", async ({ name, known, answer, extras, description }) => {
    const extracted = extractCompoundListingFacts(answer, {
      activeSlot: "condition",
      baseDraft: known,
    });
    const fill: SkyAiListingFill = { ...known, ...extracted.partial };
    const blob = (fill.extras || []).join(" | ");
    for (const pattern of extras) {
      expect(blob, blob).toMatch(pattern);
    }
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts.sellerEvidence || facts.product || facts.extras.length).toBeTruthy();
    const written = await finalizeAwhinaListingDescriptionAsync(fill, {
      writer: async (writerFacts) =>
        JSON.stringify({ description: descriptionFromWriterFacts(writerFacts) }),
    });
    const copy = String(written.description || "");
    const fallback = String(
      (
        await finalizeAwhinaListingDescriptionAsync(fill, {
          writer: async () => null,
        })
      ).description || ""
    );
    for (const pattern of description) {
      expect(copy, copy).toMatch(pattern);
      expect(fallback, fallback).toMatch(pattern);
    }
    expect(copy).not.toMatch(MARKETING_FILLER_RE);
    expect(copy).not.toMatch(/classic era|known for its performance/i);
    if (name === "mountain bike") {
      expect(copy).not.toMatch(/brand new/i);
    }
    if (name === "iPhone") {
      expect(extracted.partial.price).toBeFalsy();
    }
  });
});
