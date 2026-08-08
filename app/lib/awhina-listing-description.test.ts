/**
 * Snapshot + quality gates for marketplace description generation.
 * Guards against robotic field-restating copy regressing over time.
 */
import { describe, expect, it } from "vitest";
import {
  buildListingDescriptionFromFacts,
  isRoboticListingDescription,
  passesListingDescriptionQualityGate,
  resolveListingDescriptionStyle,
  IMPLY_CLAIMS_RE,
  type ListingDescriptionQuality,
} from "./awhina-product-ux";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import { clearListingDraftSession, listingDraftSessionKey } from "./awhina-listing-fill-tools";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

const ROBOTIC_SMELLS =
  /\bCondition:\s*|\bLocated in [A-Za-z].*\.\s*Pickup available\.|\bMessage me with any questions\b|\bOdometer:\s*|\bColour:\s*|\bI'm selling this\b|\bIt's based in\b|\bFeel free to get in touch if you'd like more information\b/i;

/** Buyer-facing meta / AI-safety voice — must never appear in descriptions. */
const META_PHRASE_SMELLS =
  /\bno guesswork\b|\bbased on (the )?(available|provided|supplied) (details|information)\b|\busing only supplied\b|\bfrom the information provided\b|\bbased on what we know\b|\bverified facts only\b|\bI haven'?t assumed\b|\bI didn'?t invent\b|\bStraightforward listing\b|\bdetails we have\b|\bfacts we know\b|\bknown details\b|\bwhat is known\b|\bhere is what we know\b|\bCan do pickup\b|\bAvailable around\b|\bAI\b|\bgenerated\b|\bassumed\b/i;

/** Implied functionality / condition / photo claims without supplied facts. */
const UNGROUNDED_CLAIM_SMELLS = IMPLY_CLAIMS_RE;

function assertNoDuplicateSentences(desc: string) {
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (let i = 1; i < sentences.length; i++) {
    expect(sentences[i]).not.toBe(sentences[i - 1]);
  }
}

function assertNaturalMarketplaceCopy(desc: string) {
  expect(desc.trim().length).toBeGreaterThan(40);
  expect(desc).not.toMatch(ROBOTIC_SMELLS);
  expect(desc).not.toMatch(META_PHRASE_SMELLS);
  expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
  expect(isRoboticListingDescription(desc)).toBe(false);
  expect(passesListingDescriptionQualityGate(desc)).toBe(true);
  expect(desc).not.toContain("\n\n");
  assertNoDuplicateSentences(desc);
  const words = desc.split(/\s+/).filter(Boolean).length;
  expect(words).toBeGreaterThanOrEqual(35);
  expect(words).toBeLessThanOrEqual(100);
  const labelSentences = desc
    .split(/(?<=\.)\s+/)
    .filter((s) =>
      /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Pickup only\.)/i.test(s.trim())
    );
  expect(labelSentences.length).toBe(0);
}

describe("resolveListingDescriptionStyle", () => {
  it("maps categories to prose styles", () => {
    expect(resolveListingDescriptionStyle({ listingType: "vehicle" })).toBe("vehicle");
    expect(resolveListingDescriptionStyle({ listingType: "service" })).toBe("service");
    expect(resolveListingDescriptionStyle({ listingType: "rental" })).toBe("rental");
    expect(resolveListingDescriptionStyle({ category: "Gaming", title: "PS5" })).toBe("gaming");
    expect(resolveListingDescriptionStyle({ category: "Tech", title: "iPhone 15" })).toBe(
      "electronics"
    );
    expect(resolveListingDescriptionStyle({ category: "Home", title: "Couch" })).toBe("furniture");
    expect(resolveListingDescriptionStyle({ category: "Home", title: "Lawn Mower" })).toBe(
      "home_garden"
    );
    expect(resolveListingDescriptionStyle({ category: "Fashion", title: "Jacket" })).toBe(
      "clothing"
    );
    expect(resolveListingDescriptionStyle({ category: "Sports", title: "Bike" })).toBe("sports");
  });
});

describe("listing description quality levels", () => {
  const base: SkyAiListingFill = {
    title: "Brand New PlayStation 5 Console",
    price: "650",
    condition: "New",
    location: "Auckland",
    pickupAvailable: true,
    category: "Gaming",
    listingType: "physical",
  };

  const levels: ListingDescriptionQuality[] = ["standard", "premium", "premium_plus"];

  for (const quality of levels) {
    it(`${quality} stays truthful and non-robotic`, () => {
      const desc = buildListingDescriptionFromFacts(base, { quality });
      expect(desc).toMatch(/PlayStation\s*5/i);
      expect(desc).toMatch(/Auckland/);
      expect(desc).toMatch(/\$650/);
      expect(desc).not.toMatch(/controller|dualsense|games|SSD|warranty|authentic/i);
      expect(desc).not.toMatch(/Condition:|Message me with any questions|I'm selling this/i);
    });
  }

  it("Āwhina default is Premium Plus (one paragraph, natural CTA variety)", () => {
    const desc = buildListingDescriptionFromFacts(base);
    expect(desc).not.toContain("\n\n");
    expect(desc).not.toMatch(/Feel free to get in touch if you'd like more information/i);
    expect(desc).not.toMatch(/^Happy to answer questions\.$/);
    expect(passesListingDescriptionQualityGate(desc)).toBe(true);
  });

  it("standard uses compact single-block close", () => {
    const desc = buildListingDescriptionFromFacts(base, { quality: "standard" });
    expect(desc).toMatch(/Happy to answer questions/i);
    expect(desc).not.toContain("\n\n");
  });
});

describe("category-aware description snapshots", () => {
  const cases: Array<{ name: string; fill: SkyAiListingFill; must: RegExp[]; never: RegExp[] }> = [
    {
      name: "gaming electronics",
      fill: {
        title: "Brand New PlayStation 5 Console",
        price: "650",
        condition: "New",
        location: "Auckland",
        pickupAvailable: true,
        category: "Gaming",
        listingType: "physical",
      },
      must: [/PlayStation\s*5/i, /Auckland/, /\$650/],
      never: [
        /Condition:/i,
        /Message me with any questions/i,
        /I'm selling this/i,
        /controller|dualsense|games included/i,
        /Feel free to get in touch if you'd like more information/i,
      ],
    },
    {
      name: "phones / electronics",
      fill: {
        title: "Like New iPhone 15 Pro",
        price: "950",
        condition: "Used - Like New",
        location: "Wellington",
        pickupAvailable: true,
        shippingAvailable: true,
        category: "Tech",
        listingType: "physical",
      },
      must: [/iPhone\s*15\s*Pro/i, /Wellington/, /\$950/, /pickup/i, /shipping/i],
      never: [
        /Condition:/i,
        /256GB|battery|charger included/i,
        /I'm selling this/i,
        META_PHRASE_SMELLS,
        /Can do pickup/i,
      ],
    },
    {
      name: "vehicles",
      fill: {
        title: "2018 BMW 320i",
        listingType: "vehicle",
        category: "Cars",
        vehicleYear: "2018",
        vehicleMake: "BMW",
        vehicleModel: "320i",
        vehicleOdometer: "85000",
        vehicleColour: "Blue",
        vehicleTransmission: "Automatic",
        price: "18500",
        location: "Auckland",
        condition: "Used - Good",
      },
      must: [/2018/, /BMW/, /320i/, /Auckland/, /85,?000/, /blue/i, /\$18500/],
      never: [
        /Condition:/i,
        /Odometer:/i,
        /Colour:/i,
        /Message me with any questions/i,
        /WOF|service history/i,
        /based in/i,
        /Selling my/i,
      ],
    },
    {
      name: "furniture",
      fill: {
        title: "3 Seater Couch",
        price: "250",
        condition: "Used - Good",
        location: "Christchurch",
        pickupAvailable: true,
        shippingAvailable: false,
        category: "Home",
        listingType: "physical",
      },
      must: [/couch/i, /Christchurch/, /\$250/, /pickup/i, /good used condition/i],
      never: [/Condition:/i, /Message me with any questions/i, /leather|recliner|stain/i, META_PHRASE_SMELLS],
    },
    {
      name: "home and garden",
      fill: {
        title: "Lawn Mower",
        price: "180",
        condition: "Used - Good",
        location: "Palmerston North",
        pickupAvailable: true,
        category: "Home",
        listingType: "physical",
      },
      must: [/Lawn Mower|lawn mower/i, /Palmerston North/, /\$180/],
      never: [/Condition:/i, /self[- ]propelled|petrol|warranty/i, /I'm selling this/i],
    },
    {
      name: "clothing",
      fill: {
        title: "North Face Jacket",
        price: "120",
        condition: "Used - Like New",
        location: "Hamilton",
        pickupAvailable: true,
        category: "Fashion",
        listingType: "physical",
      },
      must: [/North Face|Jacket/i, /Hamilton/, /\$120/, /like-new/i],
      never: [/Condition:/i, /size M|waterproof|genuine/i],
    },
    {
      name: "sports",
      fill: {
        title: "Mountain Bike",
        price: "400",
        condition: "Used - Good",
        location: "Dunedin",
        pickupAvailable: true,
        category: "Sports",
        listingType: "physical",
      },
      must: [/bike/i, /Dunedin/, /\$400/],
      never: [/Condition:/i, /shimano|disc brakes|helmet/i],
    },
    {
      name: "services",
      fill: {
        title: "Lawn Mowing",
        listingType: "service",
        category: "Trades & Repairs",
        location: "Hamilton",
        price: "60",
        servicePricingType: "hourly",
      },
      must: [/Lawn Mowing|lawn mowing/i, /Hamilton/, /\$60/, /hour/i],
      never: [/Condition:/i, /insured|fully equipped/i],
    },
    {
      name: "property rental",
      fill: {
        title: "2 Bedroom Apartment",
        listingType: "rental",
        rentalSubType: "property",
        category: "Property",
        location: "Auckland",
        rentalBedrooms: "2",
        rentalBathrooms: "1",
        rentalPriceWeekly: "520",
        rentalDeposit: "2080",
        rentalFurnishedStatus: "Unfurnished",
      },
      must: [/Apartment/i, /Auckland/, /\$520\/week/, /\$2080/, /2 bedroom/i],
      never: [/Condition:/i, /Message me with any questions/i, /pet friendly|heat pump/i],
    },
  ];

  for (const c of cases) {
    it(`${c.name} snapshot`, () => {
      const desc = buildListingDescriptionFromFacts(c.fill);
      assertNaturalMarketplaceCopy(desc);
      for (const re of c.must) expect(desc).toMatch(re);
      for (const re of c.never) expect(desc).not.toMatch(re);
      expect(desc).toMatchSnapshot();
    });
  }

  it("rejects field-to-sentence robotic copy", () => {
    expect(
      isRoboticListingDescription(
        "Selling Samsung TV. Condition: Used - Good. Located in Auckland. Pickup available. Message me with any questions."
      )
    ).toBe(true);
    expect(
      isRoboticListingDescription(
        "I'm selling this brand new PlayStation 5 Console.\n\nIt's based in Auckland, and I'm happy to arrange pickup.\n\nAsking $650.\n\nFeel free to get in touch if you'd like more information or would like to arrange pickup."
      )
    ).toBe(true);
  });

  it("rejects meta / AI safety commentary in buyer copy", () => {
    expect(
      isRoboticListingDescription(
        "iPhone 15 Pro in good used condition. Straightforward listing with the details we have — no guesswork on specs. Asking $900."
      )
    ).toBe(true);
    expect(
      passesListingDescriptionQualityGate(
        "iPhone 15 Pro in good used condition. Pickup is available in Hamilton, and I'm asking $900. Straightforward listing with the details we have — no guesswork on specs. Happy to share clearer photos of any detail once you message."
      )
    ).toBe(false);
  });

  it("rejects ungrounded functionality / photo claims in buyer copy", () => {
    expect(
      isRoboticListingDescription(
        "Samsung TV ready for use in Auckland. Works well as a clean upgrade if this is what you need. Asking $400."
      )
    ).toBe(true);
    expect(
      passesListingDescriptionQualityGate(
        "Lawn Mower ready to go in Palmerston North. I'm asking $180. Message if you want another look at the photos first."
      )
    ).toBe(false);
  });
});

describe("sparse listings stay grounded", () => {
  it("phrase banks themselves contain no implied-claim strings", () => {
    const src = readFileSync(join(__dirname, "awhina-product-ux.ts"), "utf8");
    const bridgeStart = src.indexOf("const BRIDGE_BANK");
    const ctaStart = src.indexOf("const CTA_BANK");
    const ctaEnd = src.indexOf("function locationInText", ctaStart);
    expect(bridgeStart).toBeGreaterThan(-1);
    expect(ctaStart).toBeGreaterThan(bridgeStart);
    expect(ctaEnd).toBeGreaterThan(ctaStart);
    const banks = src.slice(bridgeStart, ctaEnd);
    // Strip string contents and assert none match IMPLY_CLAIMS
    const phrases = [...banks.matchAll(/"([^"\\]|\\.)*"/g)].map((m) =>
      m[0].slice(1, -1).replace(/\\"/g, '"')
    );
    expect(phrases.length).toBeGreaterThan(20);
    for (const phrase of phrases) {
      expect(phrase).not.toMatch(IMPLY_CLAIMS_RE);
    }
  });

  const sparseFills: SkyAiListingFill[] = [
    {
      title: "Samsung TV",
      price: "400",
      location: "Auckland",
      category: "Tech",
      listingType: "physical",
    },
    {
      title: "PlayStation 5",
      price: "500",
      location: "Wellington",
      category: "Gaming",
      listingType: "physical",
    },
    {
      title: "3 Seater Couch",
      price: "250",
      location: "Christchurch",
      category: "Home",
      listingType: "physical",
    },
    {
      title: "Lawn Mower",
      price: "180",
      location: "Palmerston North",
      category: "Home",
      listingType: "physical",
    },
    {
      title: "North Face Jacket",
      price: "120",
      location: "Hamilton",
      category: "Fashion",
      listingType: "physical",
    },
    {
      title: "Mountain Bike",
      price: "350",
      location: "Dunedin",
      category: "Sports",
      listingType: "physical",
    },
  ];

  for (const fill of sparseFills) {
    it(`${fill.title} has no implied function, condition, or photo claims`, () => {
      const desc = buildListingDescriptionFromFacts(fill);
      expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
      expect(desc).not.toMatch(META_PHRASE_SMELLS);
      expect(desc).not.toMatch(
        /\bworks well\b|\bworks perfectly\b|\bperfect condition\b|\bexcellent condition\b|\bclean upgrade\b|\bwell looked after\b|\bphotos?\b/i
      );
      expect(desc).toMatch(/\$\d+/);
      expect(isRoboticListingDescription(desc)).toBe(false);
    });
  }
});

describe("iPhone Hamilton natural seller copy", () => {
  it("produces pickup-in-city copy without meta commentary", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Apple iPhone 15 Pro 128GB",
      price: "900",
      condition: "Used - Good",
      location: "Hamilton",
      pickupAvailable: true,
      category: "Tech",
      listingType: "physical",
    });
    expect(desc).toMatch(/iPhone\s*15\s*Pro/i);
    expect(desc).toMatch(/128\s*GB|128GB/i);
    expect(desc).toMatch(/good used condition/i);
    expect(desc).toMatch(/Pickup is available in Hamilton/i);
    expect(desc).toMatch(/\$900/);
    expect(desc).toMatch(/message/i);
    expect(desc).not.toMatch(META_PHRASE_SMELLS);
    expect(desc).not.toMatch(/Can do pickup|Available around/i);
    assertNaturalMarketplaceCopy(desc);
    expect(desc).toMatchSnapshot();
  });
});

describe("never invent unstated details", () => {
  it("does not add accessories or warranty from title alone", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Samsung 55 inch TV",
      price: "400",
      condition: "Used - Good",
      location: "Auckland",
      category: "Tech",
    });
    expect(desc).not.toMatch(/remote|wall mount|smart apps|warranty|4K|HDR/i);
  });

  it("weaves only real multi-word extras", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "2015 Mazda Axela",
      listingType: "vehicle",
      vehicleYear: "2015",
      vehicleMake: "Mazda",
      vehicleModel: "Axela",
      vehicleOdometer: "128000",
      price: "11500",
      location: "Auckland",
      extras: ["Recently serviced", "kw:Mazda", "kw:Axela"],
    });
    expect(desc).toMatch(/Recently serviced/i);
    expect(desc).not.toMatch(/kw:Mazda|WOF|new tyres|Stage 2/i);
  });
});

describe("one-shot sell uses Premium Plus description path", () => {
  it("PS5 one-shot is natural marketplace copy", () => {
    wipe("desc-ps5");
    const r = processCanonicalAwhina(
      "want to list my ps5 its brand new 200 bucks pick up auckland",
      { conversationId: "desc-ps5", pathname: "/" }
    );
    const desc = String(r.listingFill?.description || "");
    expect(desc).toMatch(/PlayStation\s*5|PS5/i);
    expect(desc).toMatch(/Auckland/i);
    expect(desc).toMatch(/\$200/);
    assertNaturalMarketplaceCopy(desc);
    expect(desc).toMatchSnapshot();
  });

  it("vehicle one-shot description is category-styled", () => {
    wipe("desc-bmw");
    const r = processCanonicalAwhina(
      "selling my 2018 BMW 320i 85000km Auckland $18500",
      { conversationId: "desc-bmw", pathname: "/" }
    );
    const desc = String(r.listingFill?.description || "");
    expect(desc).toMatch(/BMW/i);
    expect(desc).toMatch(/85,?000|Auckland|\$18500/i);
    expect(desc).not.toMatch(ROBOTIC_SMELLS);
    expect(desc).not.toMatch(META_PHRASE_SMELLS);
    expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
    expect(desc).toMatchSnapshot();
  });
});

