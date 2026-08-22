/**
 * Broad description quality regression — category-agnostic architecture checks.
 * Tests assert behaviour, not product-specific templates.
 */
import { describe, expect, it } from "vitest";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";
import { buildListingDescriptionFromFacts } from "./awhina-listing-description";
import {
  GENERIC_MARKETPLACE_FILLER_RE,
  hasSemanticFactDuplication as hasDupes,
  polishPublicDescription,
} from "./awhina-description-quality";
import {
  buildDescriptionWriterFacts,
  MARKETING_FILLER_RE,
  validateAiListingDescription,
} from "./awhina-description-writer";

function describeFill(fill: SkyAiListingFill, opts?: { force?: boolean }): string {
  if (!fill.title?.trim()) return "";
  const base: SkyAiListingFill = {
    listingType: fill.listingType || "physical",
    category: fill.category || "Other",
    ...fill,
  };
  return finalizeAwhinaListingDescription(base, { force: opts?.force }).description || "";
}

function assertQuality(desc: string, fill: SkyAiListingFill, must: RegExp[], mustNot: RegExp[] = []) {
  expect(desc.trim().length, "non-empty description").toBeGreaterThan(10);
  for (const re of must) expect(desc, re.source).toMatch(re);
  for (const re of mustNot) expect(desc, `must not match ${re.source}`).not.toMatch(re);
  expect(desc).not.toMatch(MARKETING_FILLER_RE);
  expect(desc).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  expect(hasDupes(desc)).toBe(false);
  const facts = buildDescriptionWriterFacts(fill);
  const validated = validateAiListingDescription(desc, facts);
  if (validated) expect(validated.length, "validation accepts copy").toBeGreaterThan(20);
}

const CASES: Array<{
  name: string;
  fill: Partial<SkyAiListingFill> & { title: string };
  must: RegExp[];
  mustNot?: RegExp[];
}> = [
  {
    name: "iPhone",
    fill: {
      title: "Apple iPhone 15 Pro 256GB",
      condition: "Used - Like New",
      location: "Hamilton",
      extras: ["storage:256GB", "colour:Natural Titanium", "battery:94%"],
    },
    must: [/256GB/i, /Hamilton/i, /like[- ]new|good/i],
    mustNot: [/Hilux/i, /Samsung/i, /standout vehicle/i],
  },
  {
    name: "Samsung Galaxy",
    fill: {
      title: "Samsung Galaxy S24 Ultra 512GB",
      condition: "Used - Good",
      location: "Henderson, Auckland",
      extras: ["storage:512GB", "colour:Titanium Black", "includes:original box", "includes:S Pen"],
    },
    must: [/512GB/i, /Henderson/i, /Titanium Black/i],
    mustNot: [/iPhone/i, /128,?000\s*km/i],
  },
  {
    name: "PS5",
    fill: {
      title: "PlayStation 5 Disc Edition",
      condition: "Used - Good",
      location: "Christchurch",
      extras: ["includes:2 controllers", "includes:original box"],
    },
    must: [/PlayStation|PS5/i, /Christchurch/i, /controller/i],
    mustNot: [/odometer/i, /weekly rent/i],
  },
  {
    name: "laptop",
    fill: {
      title: "Dell XPS 15",
      condition: "Used - Good",
      location: "Wellington",
      extras: ["storage:1TB SSD", "ram:32GB", "includes:charger"],
    },
    must: [/Dell|XPS/i, /Wellington/i],
    mustNot: [/mowing|rental property/i],
  },
  {
    name: "Toyota Hilux",
    fill: {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Good",
      location: "Auckland",
      vehicleYear: "2018",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleOdometer: "128000",
      vehicleTransmission: "Automatic",
      vehicleFuelType: "Diesel",
      vehicleColour: "Black",
      extras: ["includes:canopy", "includes:tow bar", "service:full service history"],
    },
    must: [/2018/i, /128,?000\s*km/i, /diesel/i, /automatic/i, /Auckland/i],
    mustNot: [/256GB/i, /iPhone/i, /dealership/i, /standout vehicle/i],
  },
  {
    name: "Nissan Skyline R34",
    fill: {
      title: "1999 Nissan Skyline R34 GT-R",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Good",
      location: "Tauranga",
      vehicleYear: "1999",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline",
      vehicleGeneration: "R34",
      vehicleOdometer: "89000",
      vehicleTransmission: "Manual",
      vehicleFuelType: "Petrol",
    },
    must: [/1999|R34|Skyline/i, /89,?000\s*km/i, /manual/i, /Tauranga/i],
    mustNot: [/iPhone/i, /512GB/i],
  },
  {
    name: "commuter car",
    fill: {
      title: "2007 Honda Fit",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Fair",
      location: "Palmerston North",
      vehicleYear: "2007",
      vehicleMake: "Honda",
      vehicleModel: "Fit",
      vehicleOdometer: "185000",
      vehicleTransmission: "Automatic",
    },
    must: [/2007|Honda|Fit/i, /185,?000\s*km/i, /Palmerston/i],
    mustNot: [/GT-R|Hilux/i],
  },
  {
    name: "Pokémon card",
    fill: {
      title: "Charizard VMAX",
      category: "Collectibles",
      condition: "Used - Like New",
      location: "Auckland",
      extras: ["set:Champion's Path", "grade:PSA 10", "subject:Charizard"],
    },
    must: [/Charizard/i, /PSA\s*10/i, /Champion/i],
    mustNot: [/rare collectible for fans/i, /odometer/i, /weekly rent/i],
  },
  {
    name: "Yu-Gi-Oh card",
    fill: {
      title: "Blue-Eyes White Dragon",
      category: "Collectibles",
      condition: "Used - Good",
      location: "Hamilton",
      extras: ["set:Legend of Blue Eyes", "grade:Near Mint"],
    },
    must: [/Blue-Eyes/i, /Hamilton/i],
    mustNot: [/vehicle rental/i],
  },
  {
    name: "football card",
    fill: {
      title: "Lionel Messi Panini card",
      category: "Collectibles",
      condition: "Used - Good",
      location: "Dunedin",
      extras: ["subject:Lionel Messi", "set:Panini World Cup"],
    },
    must: [/Messi/i, /Dunedin/i],
  },
  {
    name: "multi-card lot",
    fill: {
      title: "Mixed Pokémon card lot",
      category: "Collectibles",
      condition: "Used - Good",
      location: "Rotorua",
      extras: ["quantity:40 cards", "bundle:assorted holos and commons"],
    },
    must: [/Pokémon|card/i, /Rotorua/i],
  },
  {
    name: "couch",
    fill: {
      title: "3-seater fabric couch",
      condition: "Used - Good",
      location: "Auckland",
      extras: ["colour:grey", "dimensions:210cm wide", "pickup only"],
    },
    must: [/couch|seater/i, /Auckland/i, /grey|210/i],
    mustNot: [/odometer|battery health/i],
  },
  {
    name: "lawn mower",
    fill: {
      title: "Masport petrol lawn mower",
      condition: "Used - Good",
      location: "Nelson",
      extras: ["fuel:petrol", "catch bag included"],
    },
    must: [/mower|Masport/i, /Nelson/i],
  },
  {
    name: "power tool",
    fill: {
      title: "Milwaukee impact driver",
      condition: "Used - Good",
      location: "Invercargill",
      extras: ["includes:2 batteries", "includes:charger"],
    },
    must: [/Milwaukee|impact/i, /Invercargill/i],
  },
  {
    name: "shoes",
    fill: {
      title: "Nike Air Max 90",
      condition: "Used - Good",
      location: "Auckland",
      extras: ["size:US 10", "colour:white/black"],
    },
    must: [/Nike|Air Max/i, /size|10/i, /Auckland/i],
  },
  {
    name: "jacket",
    fill: {
      title: "Patagonia rain jacket",
      condition: "Used - Good",
      location: "Queenstown",
      extras: ["size:Large", "colour:navy"],
    },
    must: [/Patagonia|jacket/i, /Queenstown/i],
  },
  {
    name: "dining table",
    fill: {
      title: "Solid oak dining table",
      condition: "Used - Good",
      location: "New Plymouth",
      extras: ["seats:6", "material:oak"],
    },
    must: [/oak|table/i, /New Plymouth/i],
  },
  {
    name: "baby item",
    fill: {
      title: "Bugaboo pram",
      condition: "Used - Good",
      location: "Whangārei",
      extras: ["includes:rain cover", "includes:bassinet"],
    },
    must: [/Bugaboo|pram/i, /Whangārei/i],
  },
  {
    name: "lawn mowing service",
    fill: {
      title: "Lawn mowing",
      listingType: "service",
      category: "Gardening",
      location: "Auckland",
      extras: ["service area:North Shore", "pricing:from $60"],
    },
    must: [/lawn|mowing/i, /Auckland|North Shore/i],
    mustNot: [/128,?000\s*km|512GB/i],
  },
  {
    name: "house cleaning",
    fill: {
      title: "House cleaning service",
      listingType: "service",
      category: "Cleaning",
      location: "Wellington",
      extras: ["pricing:hourly", "includes:supplies"],
    },
    must: [/clean/i, /Wellington/i],
  },
  {
    name: "photography service",
    fill: {
      title: "Event photography",
      listingType: "service",
      category: "Photography",
      location: "Christchurch",
      extras: ["turnaround:48 hours", "includes:edited digital files"],
    },
    must: [/photograph/i, /Christchurch/i],
  },
  {
    name: "trailer hire",
    fill: {
      title: "6x4 box trailer hire",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Hamilton",
      price: "45",
      rentalPriceDaily: "45",
      rentalDeposit: "100",
      rentalSubType: "equipment",
    },
    must: [/trailer/i, /Hamilton/i],
    mustNot: [/iPhone|256GB/i],
  },
  {
    name: "equipment hire",
    fill: {
      title: "Concrete mixer hire",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Tauranga",
      rentalSubType: "equipment",
      rentalPriceWeekly: "180",
      rentalDeposit: "200",
    },
    must: [/mixer|concrete/i, /Tauranga/i],
  },
  {
    name: "property rental",
    fill: {
      title: "2 bedroom flat",
      listingType: "rental",
      category: "Property",
      location: "Mount Eden, Auckland",
      rentalSubType: "property",
      rentalBedrooms: "2",
      rentalBathrooms: "1",
      rentalPriceWeekly: "550",
      rentalDeposit: "2200",
    },
    must: [/2 bedroom|flat/i, /Mount Eden|Auckland/i, /550|week/i],
    mustNot: [/odometer|512GB/i],
  },
  {
    name: "niche vintage typewriter",
    fill: {
      title: "1960s Olivetti Lettera 32 typewriter",
      condition: "Used - Good",
      location: "Greymouth",
      extras: ["ribbon:new", "case included", "all keys working"],
    },
    must: [/Olivetti|typewriter/i, /Greymouth/i],
    mustNot: [/512GB|Hilux|weekly rent/i],
  },
];

describe("description quality suite — category cases", () => {
  for (const testCase of CASES) {
    it(testCase.name, () => {
      const fill: SkyAiListingFill = {
        listingType: testCase.fill.listingType || "physical",
        category: testCase.fill.category || "Other",
        ...testCase.fill,
        condition:
          testCase.fill.condition ??
          (testCase.fill.listingType === "service" || testCase.fill.listingType === "rental"
            ? undefined
            : "Used - Good"),
      };
      const desc = describeFill({ ...fill, title: fill.title || testCase.fill.title }, { force: true });
      assertQuality(desc, fill, testCase.must, testCase.mustNot || []);
    });
  }
});

describe("description quality — edits and isolation", () => {
  it("battery health edit replaces old percentage", () => {
    const fill: SkyAiListingFill = {
      title: "Samsung Galaxy S24 Ultra",
      condition: "Used - Good",
      location: "Henderson, Auckland",
      extras: ["battery:91%"],
    };
    const desc = describeFill(fill, { force: true });
    expect(desc).toMatch(/91\s*%/i);
    expect(desc).not.toMatch(/94\s*%/);
  });

  it("location edit uses new suburb precision", () => {
    const fill: SkyAiListingFill = {
      title: "Samsung Galaxy S24 Ultra",
      condition: "Used - Good",
      location: "Hamilton",
    };
    const desc = describeFill(fill, { force: true });
    expect(desc).toMatch(/Hamilton/i);
    expect(desc).not.toMatch(/Henderson/i);
  });

  it("replaceDraft forces recompose without prior listing bleed", () => {
    const hilux: SkyAiListingFill = {
      title: "2018 Toyota Hilux SR5",
      listingType: "vehicle",
      category: "Cars",
      condition: "Used - Good",
      location: "Auckland",
      vehicleYear: "2018",
      vehicleMake: "Toyota",
      vehicleModel: "Hilux",
      vehicleOdometer: "128000",
      replaceDraft: true,
      description:
        "Apple iPhone 15 Pro 256GB in Natural Titanium with 94% battery health. Located in Hamilton.",
    };
    const desc = finalizeAwhinaListingDescription(hilux, { force: true }).description || "";
    expect(desc).toMatch(/Hilux|Toyota|128,?000/i);
    expect(desc).not.toMatch(/iPhone|256GB|Natural Titanium|94\s*%/i);
  });

  it("rejects contaminated upstream prose with semantic duplicates", () => {
    const bad =
      "Samsung Galaxy S24 Ultra in Auckland in good condition. Located in Auckland. The phone is in good condition.";
    const fill: SkyAiListingFill = {
      title: "Samsung Galaxy S24 Ultra",
      condition: "Used - Good",
      location: "Auckland",
    };
    expect(hasDupes(bad)).toBe(true);
    const polished = polishPublicDescription(bad, fill);
    expect(hasDupes(polished)).toBe(false);
    expect(polished).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  });

  it("sequential listing transitions stay isolated", () => {
    const chain = [
      {
        title: "Apple iPhone 15 Pro",
        extras: ["storage:256GB"],
        location: "Hamilton",
      },
      {
        title: "2018 Toyota Hilux SR5",
        listingType: "vehicle" as const,
        vehicleYear: "2018",
        vehicleMake: "Toyota",
        vehicleModel: "Hilux",
        vehicleOdometer: "128000",
        location: "Auckland",
        replaceDraft: true,
      },
      {
        title: "Samsung Galaxy S24 Ultra",
        extras: ["storage:512GB"],
        location: "Henderson, Auckland",
        replaceDraft: true,
      },
      {
        title: "Charizard VMAX PSA 10",
        category: "Collectibles",
        extras: ["grade:PSA 10"],
        location: "Wellington",
        replaceDraft: true,
      },
      {
        title: "Lawn mowing",
        listingType: "service" as const,
        location: "Christchurch",
        replaceDraft: true,
      },
      {
        title: "6x4 trailer hire",
        listingType: "rental" as const,
        location: "Dunedin",
        replaceDraft: true,
      },
    ];

    let priorDesc = "";
    for (const step of chain) {
      const fill: SkyAiListingFill = {
        listingType: step.listingType || "physical",
        category: "Other",
        condition: "Used - Good",
        ...step,
        description: priorDesc || undefined,
      };
      const desc = finalizeAwhinaListingDescription(fill, { force: true }).description || "";
      expect(desc.length).toBeGreaterThan(10);
      if (/iPhone/i.test(step.title)) {
        expect(desc).toMatch(/iPhone/i);
        expect(desc).not.toMatch(/Hilux|Charizard|trailer hire/i);
      }
      if (/Hilux/i.test(step.title)) {
        expect(desc).toMatch(/Hilux|128,?000/i);
        expect(desc).not.toMatch(/iPhone|256GB|Charizard|512GB/i);
      }
      if (/Samsung/i.test(step.title)) {
        expect(desc).toMatch(/Samsung|512/i);
        expect(desc).not.toMatch(/iPhone|Hilux|Charizard|mowing/i);
      }
      if (/Charizard/i.test(step.title)) {
        expect(desc).toMatch(/Charizard|PSA/i);
        expect(desc).not.toMatch(/iPhone|Hilux|Samsung|mowing|trailer/i);
      }
      if (/Lawn mowing/i.test(step.title)) {
        expect(desc).toMatch(/lawn|mowing/i);
        expect(desc).not.toMatch(/iPhone|Hilux|Charizard|512GB|128,?000/i);
      }
      if (/trailer/i.test(step.title)) {
        expect(desc).toMatch(/trailer/i);
        expect(desc).not.toMatch(/iPhone|Hilux|Charizard|256GB/i);
      }
      priorDesc = desc;
    }
  });

  it("adaptive length — sparse listing stays short", () => {
    const fill: SkyAiListingFill = {
      title: "Used bookshelf",
      condition: "Used - Good",
      location: "Napier",
    };
    const desc = buildListingDescriptionFromFacts(fill, { force: true });
    const sentences = desc.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(5);
    expect(desc).toMatch(/Napier/i);
  });
});
