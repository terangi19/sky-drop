/**
 * Serious buyer-facing description quality suite.
 * Guards: one CTA, no AI-meta, semantic dedupe, grounding, type tone, caps.
 */
import { describe, expect, it } from "vitest";
import {
  buildListingDescriptionFromFacts,
  extractDescriptionFacts,
  getVehicleDraftReadiness,
  isRoboticListingDescription,
  passesListingDescriptionQualityGate,
  resolveListingDescriptionStyle,
  cleanRentalItemName,
  validateDescription,
  stripStructuredMetadataLeakage,
  composeConditionPredicate,
  splitListingDescriptionSentences,
  IMPLY_CLAIMS_RE,
  CTA_PURPOSE_RE,
  SELLER_EDITOR_GUIDANCE_RE,
  type ListingDescriptionQuality,
} from "./awhina-listing-description";
import {
  finalizeAwhinaListingDescription,
  finalizeAwhinaListingDescriptionAsync,
} from "./awhina-listing-composer";
import {
  buildDescriptionWriterFacts,
  MARKETING_FILLER_RE,
  stripUnsupportedPromotionalSentences,
  validateAiListingDescription,
} from "./awhina-description-writer";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { processCanonicalAwhina } from "./awhina-canonical";
import { clearSearchSession, searchSessionKey } from "./awhina-search-memory";
import { clearTaskScope, taskScopeKey } from "./awhina-task-scope";
import {
  clearListingDraftSession,
  listingDraftSessionKey,
  parseListingPriceFromMessage,
  processListingFillMessage,
} from "./awhina-listing-fill-tools";
import { buildReadinessFollowUpReply } from "./awhina-listing-readiness";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function wipe(id: string) {
  clearSearchSession(searchSessionKey({ conversationId: id }));
  clearTaskScope(taskScopeKey({ conversationId: id }));
  clearListingDraftSession(listingDraftSessionKey({ conversationId: id }));
}

const META_PHRASE_SMELLS =
  /\bno guesswork\b|\bbased on (the )?(available|provided|supplied) (details|information)\b|\busing only supplied\b|\bfrom the information provided\b|\bbased on what we know\b|\bverified facts only\b|\bI haven'?t assumed\b|\bI didn'?t invent\b|\bStraightforward listing\b|\bdetails we have\b|\bfacts we know\b|\bknown details\b|\bwhat is known\b|\bhere is what we know\b|\bCan do pickup\b|\bAvailable around\b|\bAI\b|\bgenerated\b|\bassumed\b/i;

const UNGROUNDED_CLAIM_SMELLS = IMPLY_CLAIMS_RE;

const FIELD_LABEL_SMELLS =
  /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Priced at\b)/im;

const ROBOTIC_SMELLS =
  /\bCondition:\s*|\bLocated in [A-Za-z].*\.\s*Pickup available\.|\bMessage me with any questions\b|\bOdometer:\s*|\bColour:\s*|\bI'm selling this\b|\bIt's based in\b|\bFeel free to get in touch if you'd like more information\b/i;

function splitSentences(desc: string): string[] {
  return desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countCtas(desc: string): number {
  return splitSentences(desc).filter((s) => CTA_PURPOSE_RE.test(s)).length;
}

function assertNoDuplicateSentences(desc: string) {
  const sentences = splitSentences(desc).map((s) => s.toLowerCase());
  for (let i = 1; i < sentences.length; i++) {
    expect(sentences[i]).not.toBe(sentences[i - 1]);
  }
}

function assertOneCtaMax(desc: string) {
  expect(countCtas(desc)).toBeLessThanOrEqual(1);
}

function assertNoSemanticCtaDupes(desc: string) {
  const ctas = splitSentences(desc).filter((s) => CTA_PURPOSE_RE.test(s));
  expect(ctas.length).toBeLessThanOrEqual(1);
}

function assertProperCaps(desc: string) {
  for (const s of splitSentences(desc)) {
    // Allow Apple-style product casing (iPhone / iPad) at sentence start
    expect(s).toMatch(/^[A-Z0-9$]|^i[A-Z]/);
  }
}

function assertNaturalMarketplaceCopy(desc: string, opts?: { sparse?: boolean }) {
  expect(desc.trim().length).toBeGreaterThanOrEqual(20);
  expect(desc).not.toMatch(ROBOTIC_SMELLS);
  expect(desc).not.toMatch(META_PHRASE_SMELLS);
  expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
  expect(desc).not.toMatch(FIELD_LABEL_SMELLS);
  expect(isRoboticListingDescription(desc)).toBe(false);
  expect(passesListingDescriptionQualityGate(desc, { sparse: opts?.sparse })).toBe(true);
  expect(desc).not.toContain("\n\n");
  assertNoDuplicateSentences(desc);
  assertOneCtaMax(desc);
  assertNoSemanticCtaDupes(desc);
  assertProperCaps(desc);
  const words = desc.split(/\s+/).filter(Boolean).length;
  if (!opts?.sparse) {
    expect(words).toBeGreaterThanOrEqual(8);
  }
  expect(words).toBeLessThanOrEqual(100);
  const labelSentences = splitSentences(desc).filter((s) =>
    /^(Condition:|Located in|Odometer:|Colour:|Pickup available\.|Pickup only\.|Priced at)/i.test(
      s.trim()
    )
  );
  expect(labelSentences.length).toBe(0);
}

describe("resolveListingDescriptionStyle", () => {
  it("maps categories to prose styles", () => {
    expect(resolveListingDescriptionStyle({ listingType: "vehicle" })).toBe("vehicle");
    expect(resolveListingDescriptionStyle({ listingType: "service" })).toBe("service");
    expect(resolveListingDescriptionStyle({ listingType: "rental" })).toBe("rental");
    expect(resolveListingDescriptionStyle({ listingType: "wanted" })).toBe("wanted");
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

describe("grounded AI description writer quality gate", () => {
  const godCards: SkyAiListingFill = {
    title:
      "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
    listingType: "physical",
    condition: "Used - Good",
    location: "Auckland",
    extras: [
      "set:Egyptian God Cards",
      "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
      "bundle_quantity:3",
    ],
  };

  it("supplies canonical facts rather than price or location to the writer", () => {
    const facts = buildDescriptionWriterFacts(godCards);
    expect(facts.title).toContain("Winged Dragon of Ra");
    expect(facts.condition).toBe("Used - Good");
    expect(facts.quantity).toBe(3);
    expect(facts.extras).not.toContain("bundle_quantity:3");
    expect(JSON.stringify(facts)).not.toContain("Auckland");
  });

  it("rejects the exact title + condition + location failure", () => {
    expect(
      validateAiListingDescription(
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh! In good used condition for sale in Auckland.",
        buildDescriptionWriterFacts(godCards)
      )
    ).toBeNull();
  });

  it("rejects a title plus condition even when split into sentences", () => {
    expect(
      validateAiListingDescription(
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh! In good used condition.",
        buildDescriptionWriterFacts(godCards)
      )
    ).toBeNull();
  });

  it("accepts relationship-aware bundled-card prose", () => {
    expect(
      validateAiListingDescription(
        "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set.",
        buildDescriptionWriterFacts(godCards)
      )
    ).toMatch(/Set of three/);
  });

  it("does not pass raw bundle_quantity into the writer JSON", () => {
    const facts = buildDescriptionWriterFacts(godCards);
    expect(facts.quantity).toBe(3);
    expect(facts.collection).toMatch(/Egyptian God Cards/i);
    expect(facts.items).toMatch(/Winged Dragon of Ra/i);
    expect(JSON.stringify(facts)).not.toMatch(/bundle_quantity/i);
  });

  it("infers a three-card bundle from the structured photo subject list", () => {
    const fill: SkyAiListingFill = {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      category: "Sports",
      condition: "Used - Good",
      extras: [
        "set:Egyptian God Cards",
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
      ],
    };
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts.quantity).toBe(3);
    expect(finalizeAwhinaListingDescription(fill).description).toBe(
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set."
    );
  });

  it("uses grammatical condition predicates for singular and plural items", () => {
    const cases = [
      ["brand new", "is brand new", "are brand new"],
      ["new", "is new", "are new"],
      ["like new", "is in like-new condition", "are in like-new condition"],
      ["good", "is in good condition", "are in good condition"],
      ["good used", "is in good used condition", "are in good used condition"],
      ["fair", "is in fair condition", "are in fair condition"],
    ] as const;
    for (const [condition, singular, plural] of cases) {
      expect(composeConditionPredicate(condition, false)).toBe(singular);
      expect(composeConditionPredicate(condition, true)).toBe(plural);
    }
  });

  it("keeps parent identity before collection and never writes in brand new", () => {
    const fill: SkyAiListingFill = {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      condition: "New",
      extras: [
        "set:Egyptian God Cards",
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
      ],
    };
    const expected =
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are brand new and are being sold together as a set.";
    expect(finalizeAwhinaListingDescription(fill).description).toBe(expected);
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts.parentIdentity).toBe("Yu-Gi-Oh!");
    expect(
      validateAiListingDescription(
        "Set of three Egyptian God Cards Yu-Gi-Oh! featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in brand new and are being sold together as a set.",
        facts
      )
    ).toBeNull();
  });

  it("repairs parent/product order without splitting punctuation-containing names", () => {
    const fill: SkyAiListingFill = {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      extras: [
        "set:Egyptian God Cards",
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
      ],
    };
    const current =
      "Set of three Egyptian God Cards Yu-Gi-Oh! Featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. They are being sold together as a set.";
    const expected =
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. They are being sold together as a set.";
    expect(
      validateAiListingDescription(current, buildDescriptionWriterFacts(fill))
    ).toBe(expected);
    expect(splitListingDescriptionSentences(expected)).toEqual([
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor.",
      "They are being sold together as a set.",
    ]);
  });

  it("promotes photo-extracted product and card details into grounded writer facts", () => {
    const facts = buildDescriptionWriterFacts({
      title: "Nicolò Barella Topps Chrome",
      listingType: "physical",
      condition: "Used - Good",
      extras: [
        "subject:Nicolò Barella",
        "set:Topps Chrome",
        "manufacturer:Topps",
        "serial:14/25",
        "parallel:Gold Refractor",
        "grade:PSA 9",
        "colour:Midnight Black",
        "storage:256GB",
      ],
    });
    expect(facts.collectible).toMatchObject({
      manufacturer: "Topps",
      serialNumber: "14/25",
      parallel: "Gold Refractor",
      grade: "PSA 9",
    });
    expect(facts.product).toMatchObject({
      colour: "Midnight Black",
      storage: "256GB",
    });
    expect(facts.extras).toEqual([]);
  });

  it("rejects generic sales filler and descriptions that omit the stated condition", () => {
    const facts = buildDescriptionWriterFacts(godCards);
    expect(
      validateAiListingDescription(
        "These Egyptian God Cards are a great addition for any collector. With three available, they are perfect for your deck.",
        facts
      )
    ).toBeNull();
    expect(
      validateAiListingDescription(
        "Set of three Egyptian God Cards featuring Ra, Slifer and Obelisk. They are being sold together.",
        facts
      )
    ).toBeNull();
  });

  it("removes unsupported promotional tails instead of padding useful prose", () => {
    const original =
      "This set includes three Yu-Gi-Oh! Egyptian God Cards: The Winged Dragon of Ra, Slifer the Sky Dragon, and Obelisk the Tormentor, all in good used condition. These iconic cards are a must-have for any serious collector or player.";
    const expected =
      "This set includes three Yu-Gi-Oh! Egyptian God Cards: The Winged Dragon of Ra, Slifer the Sky Dragon, and Obelisk the Tormentor, all in good used condition.";
    expect(
      validateAiListingDescription(original, buildDescriptionWriterFacts(godCards))
    ).toBe(expected);
  });

  it("does not pad cards, electronics, bikes, vehicles, or clothing with sales fluff", () => {
    const cases: Array<{ name: string; fill: SkyAiListingFill; copy: string }> = [
      {
        name: "Yu-Gi-Oh cards",
        fill: godCards,
        copy:
          "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set. These iconic cards are a must-have for any serious collector.",
      },
      {
        name: "Topps Chrome",
        fill: {
          title: "Nicolò Barella Topps Chrome",
          listingType: "physical",
          condition: "Used - Good",
          extras: ["subject:Nicolò Barella", "set:Topps Chrome", "serial:14/25"],
        },
        copy:
          "This Nicolò Barella Topps Chrome card is numbered 14/25 and is in good used condition. A perfect addition to your collection.",
      },
      {
        name: "DualSense",
        fill: {
          title: "Sony DualSense Wireless Controller",
          listingType: "physical",
          condition: "Used - Good",
          extras: ["Comes with charging cable"],
        },
        copy:
          "Sony DualSense Wireless Controller in good used condition. Comes with charging cable. Sure to impress any gamer.",
      },
      {
        name: "iPhone",
        fill: {
          title: "Apple iPhone 15 Pro 256GB",
          listingType: "physical",
          condition: "Used - Good",
          extras: ["storage:256GB", "Battery health 94%"],
        },
        copy:
          "Apple iPhone 15 Pro with 256GB of storage is in good used condition. Battery health is 94%, ensuring reliable performance.",
      },
      {
        name: "mountain bike",
        fill: {
          title: "Marin Bobcat Trail Mountain Bike",
          listingType: "physical",
          condition: "Used - Good",
          extras: ["29 inch wheels", "Hydraulic disc brakes"],
        },
        copy:
          "Marin Bobcat Trail Mountain Bike in good used condition with 29 inch wheels and hydraulic disc brakes, making it a reliable choice for your mountain biking adventures.",
      },
      {
        name: "vehicle",
        fill: {
          title: "2011 BMW 335i",
          listingType: "vehicle",
          condition: "Used - Good",
          extras: ["New tyres"],
        },
        copy:
          "2011 BMW 335i is in good used condition and comes with new tyres. A valuable find.",
      },
      {
        name: "clothing",
        fill: {
          title: "North Face Jacket",
          listingType: "physical",
          condition: "Used - Good",
          extras: ["Size Large"],
        },
        copy:
          "North Face Jacket in good used condition, size Large. A great addition to any wardrobe.",
      },
    ];

    for (const testCase of cases) {
      const result = stripUnsupportedPromotionalSentences(testCase.copy);
      expect(result, testCase.name).not.toMatch(MARKETING_FILLER_RE);
      expect(result, testCase.name).toMatch(/\.$/);
      expect(result.split(/(?<=[.])\s+/).length, testCase.name).toBeLessThanOrEqual(2);
    }
  });

  it("rejects generic copy that drops supported collection or product details", () => {
    const cardFacts = buildDescriptionWriterFacts(godCards);
    expect(
      validateAiListingDescription(
        "Set of three Yu-Gi-Oh! Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three are in good used condition and sold together as a set.",
        cardFacts
      )
    ).toBeNull();

    const controllerFacts = buildDescriptionWriterFacts({
      title: "Sony DualSense Wireless Controller",
      listingType: "physical",
      condition: "Used - Good",
      extras: ["colour:Midnight Black", "variant:Limited Edition"],
    });
    expect(
      validateAiListingDescription(
        "Sony DualSense Wireless Controller in good used condition. Includes the confirmed product details.",
        controllerFacts
      )
    ).toBeNull();
    expect(
      validateAiListingDescription(
        "Sony DualSense Wireless Controller in the Midnight Black Limited Edition variant. The controller is in good used condition.",
        controllerFacts
      )
    ).toMatch(/Midnight Black/);
  });

  it("never exposes the title + condition + location fallback when AI writing is unavailable", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const final = await finalizeAwhinaListingDescriptionAsync({
        title: "Sony DualSense Wireless Controller",
        listingType: "physical",
        condition: "Used - Good",
        location: "Henderson, Auckland",
        extras: ["Comes with charging cable"],
      });
      expect(final.description).toMatch(/DualSense.*good used condition/i);
      expect(final.description).toMatch(/charging cable/i);
      expect(final.description).not.toMatch(/Henderson|Auckland|for sale in/i);
    } finally {
      if (previousKey) process.env.OPENAI_API_KEY = previousKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("finalize keeps validated AI prose instead of collapsing to templates", () => {
    const good =
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set.";
    const final = finalizeAwhinaListingDescription({
      ...godCards,
      description: good,
      descriptionSource: "ai",
    });
    expect(final.description).toBe(good);
    expect(final.description).not.toMatch(/for sale in Auckland/i);
  });
});

describe("facts extraction separates writing from raw text", () => {
  it("builds structured facts before writing", () => {
    const facts = extractDescriptionFacts({
      title: "Brand New PlayStation 5 Console",
      price: "200",
      condition: "New",
      location: "Auckland",
      pickupAvailable: true,
      category: "Gaming",
      listingType: "physical",
    });
    expect(facts.kind).toBe("physical");
    expect(facts.item).toMatch(/PlayStation/i);
    expect(facts.money).toBe("$200");
    expect(facts.location).toBe("Auckland");
    expect(facts.delivery).toBe("pickup");
    expect(facts.conditionPhrase).toBe("brand new");
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
      expect(desc).not.toMatch(/\$650|asking|priced at/i);
      expect(desc).not.toMatch(/controller|dualsense|games|SSD|warranty|authentic/i);
      expect(desc).not.toMatch(/Condition:|Message me with any questions|I'm selling this/i);
      assertOneCtaMax(desc);
    });
  }

  it("Āwhina default is Premium Plus (one paragraph, no auto CTA filler)", () => {
    const desc = buildListingDescriptionFromFacts(base);
    expect(desc).not.toContain("\n\n");
    expect(desc).not.toMatch(/Feel free to get in touch if you'd like more information/i);
    expect(desc).not.toMatch(/Message if interested/i);
    expect(countCtas(desc)).toBeLessThanOrEqual(1);
    expect(passesListingDescriptionQualityGate(desc)).toBe(true);
  });

  it("standard physical stays compact without CTA padding", () => {
    const desc = buildListingDescriptionFromFacts(base, { quality: "standard" });
    expect(desc).not.toMatch(/Message if interested/i);
    expect(desc).not.toContain("\n\n");
    assertOneCtaMax(desc);
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
      must: [/PlayStation\s*5/i, /Auckland/],
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
      must: [/iPhone\s*15\s*Pro/i, /Wellington/, /pickup/i, /shipping/i],
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
      must: [/2018/, /BMW/, /320i/, /Auckland/, /85,?000/, /blue/i],
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
      must: [/couch/i, /Christchurch/, /pickup/i, /good used condition/i],
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
      must: [/Lawn Mower|lawn mower/i, /Palmerston North/],
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
      must: [/North Face|Jacket/i, /Hamilton/, /like-new/i],
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
      must: [/bike/i, /Dunedin/],
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
      must: [/Lawn Mowing|lawn mowing/i, /Hamilton/, /\$60 per hour/i],
      never: [
        /Condition:/i,
        /insured|fully equipped|licensed|years of experience/i,
        /Priced at/i,
        /for local jobs/i,
        /Tell me roughly what you need/i,
        META_PHRASE_SMELLS,
        UNGROUNDED_CLAIM_SMELLS,
      ],
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
      must: [/Apartment/i, /Auckland/, /\$520(?:\/week| per week)/, /\$2080/, /2 bedroom/i],
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

  it("rejects product-templated service smells and invented credentials", () => {
    expect(
      isRoboticListingDescription(
        "Lawn Mowing for local jobs. Priced at $50. Happy to chat about what you need. Tell me roughly what you need and I can confirm timing and scope."
      )
    ).toBe(true);
    expect(
      isRoboticListingDescription(
        "Lawn mowing available in Hamilton for $50 per job. Fully insured with 10 years of experience. Message for a booking."
      )
    ).toBe(true);
  });

  it("rejects stacked CTAs as robotic", () => {
    expect(
      isRoboticListingDescription(
        "Brand new PS5. Pickup in Auckland, asking $200. Message if keen. Happy to sort a time that works for both of us. Get in touch if you'd like more information."
      )
    ).toBe(true);
  });

  it("rejects physical field-stitch available repetition", () => {
    expect(
      isRoboticListingDescription(
        "PlayStation 5 Console, brand new available. Available in Auckland, asking $500. Message if you're keen."
      )
    ).toBe(true);
    expect(
      passesListingDescriptionQualityGate(
        "PlayStation 5 Console, brand new available. Available in Auckland, asking $500. Message if you're keen."
      )
    ).toBe(false);
  });
});

describe("physical description natural prose regressions", () => {
  function assertPhysicalNatural(desc: string, opts?: { allowAvailable?: boolean }) {
    assertNaturalMarketplaceCopy(desc);
    expect(desc).not.toMatch(/brand new available|good condition available|like-new available/i);
    expect(desc).not.toMatch(/available\.\s*Available/i);
    expect(desc).not.toMatch(/up for grabs/i);
    expect(desc).not.toMatch(/Message if you're keen/i);
    const availableCount = (desc.match(/\bavailable\b/gi) || []).length;
    if (!opts?.allowAvailable) {
      expect(availableCount).toBeLessThanOrEqual(1);
    }
    expect((desc.match(/\basking\b/gi) || []).length).toBeLessThanOrEqual(1);
    expect((desc.match(/\bmessage\b/gi) || []).length).toBeLessThanOrEqual(1);
    expect((desc.match(/\bfor sale\b/gi) || []).length).toBeLessThanOrEqual(1);
  }

  it("PS5: merges condition/location into natural prose", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "PlayStation 5 Console",
      price: "500",
      condition: "New",
      location: "Auckland",
      pickupAvailable: true,
      category: "Gaming",
      listingType: "physical",
    });
    expect(desc).toMatch(/brand new/i);
    expect(desc).toMatch(/PlayStation\s*5/i);
    expect(desc).toMatch(/Auckland/);
    expect(desc).not.toMatch(/\$500|asking|priced at/i);
    expect(desc).toMatch(/pickup/i);
    expect(desc).not.toMatch(/Message if interested/i);
    assertPhysicalNatural(desc);
  });

  it("iPhone: natural weave with pickup or shipping", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "iPhone 15 Pro",
      price: "900",
      condition: "Used - Like New",
      location: "Wellington",
      pickupAvailable: true,
      shippingAvailable: true,
      category: "Tech",
      listingType: "physical",
    });
    expect(desc).toMatch(/iPhone\s*15\s*Pro/i);
    expect(desc).toMatch(/like-new|Wellington/i);
    expect(desc).not.toMatch(/\$900|asking|priced at/i);
    expect(desc).toMatch(/pickup/i);
    expect(desc).toMatch(/shipping/i);
    assertPhysicalNatural(desc);
  });

  it("couch: condition woven, not field-stitched", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "3 Seater Couch",
      price: "250",
      condition: "Used - Good",
      location: "Christchurch",
      pickupAvailable: true,
      shippingAvailable: false,
      category: "Home",
      listingType: "physical",
    });
    expect(desc).toMatch(/couch/i);
    expect(desc).toMatch(/good used condition/i);
    expect(desc).toMatch(/Christchurch/);
    expect(desc).not.toMatch(/\$250|asking|priced at/i);
    expect(desc).not.toMatch(/good used condition available/i);
    assertPhysicalNatural(desc);
  });

  it("shoes: marketplace prose without template stubs", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Nike Air Force 1",
      price: "80",
      condition: "Used - Good",
      location: "Auckland",
      pickupAvailable: true,
      category: "Fashion",
      listingType: "physical",
    });
    expect(desc).toMatch(/Nike|Air Force/i);
    expect(desc).toMatch(/Auckland/);
    expect(desc).not.toMatch(/\$80|asking|priced at/i);
    expect(desc).toMatch(/good used condition/i);
    assertPhysicalNatural(desc);
  });

  it("cards: collectibles stay grounded and natural", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Pokemon Trading Cards Bundle",
      price: "45",
      condition: "Used - Good",
      location: "Hamilton",
      pickupAvailable: true,
      category: "Gaming",
      listingType: "physical",
    });
    expect(desc).toMatch(/Pokemon|Trading Cards|cards/i);
    expect(desc).toMatch(/Hamilton/);
    expect(desc).not.toMatch(/\$45|asking|priced at/i);
    assertPhysicalNatural(desc);
  });
});

describe("description quality suite — golden reference cases", () => {
  const suite: Array<{
    name: string;
    fill: SkyAiListingFill;
    must: RegExp[];
    never: RegExp[];
    tone: RegExp;
  }> = [
    {
      name: "PS5",
      fill: {
        title: "Brand New PlayStation 5 Console",
        price: "200",
        condition: "New",
        location: "Auckland",
        pickupAvailable: true,
        category: "Gaming",
        listingType: "physical",
      },
      must: [/PlayStation|PS5/i, /Auckland/, /pickup/i],
      never: [/controller|warranty|games included|no guesswork|Message if interested/i],
      tone: /PlayStation|Auckland|pickup/i,
    },
    {
      name: "iPhone",
      fill: {
        title: "Apple iPhone 15 Pro 128GB",
        price: "900",
        condition: "Used - Good",
        location: "Hamilton",
        pickupAvailable: true,
        category: "Tech",
        listingType: "physical",
      },
      must: [/iPhone\s*15\s*Pro/i, /128/, /Hamilton/, /good used condition/i],
      never: [/battery|charger|warranty|box included|no guesswork|Message if interested/i],
      tone: /iPhone|Hamilton|good used/i,
    },
    {
      name: "BMW",
      fill: {
        title: "2018 BMW 320i",
        listingType: "vehicle",
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
      must: [/BMW/, /320i/, /85,?000/, /Auckland/],
      never: [/WOF|service history|Condition:/i],
      tone: /BMW|320i|automatic/i,
    },
    {
      name: "lawn mowing",
      fill: {
        title: "Lawn Mowing",
        listingType: "service",
        location: "Hamilton",
        price: "50",
        servicePricingType: "fixed",
      },
      must: [/lawn mowing/i, /\$50 per job/i],
      never: [/insured|Priced at|years of experience|for local jobs|^Looking for/i],
      tone: /lawn mowing|Hamilton|per job/i,
    },
    {
      name: "house cleaner",
      fill: {
        title: "House Cleaning",
        listingType: "service",
        location: "Wellington",
        servicePricingType: "request_quote",
      },
      must: [/cleaning/i, /Wellington/, /quote/i],
      never: [/insured|bonded|Priced at/i],
      tone: /cleaning|Wellington|quote/i,
    },
    {
      name: "photographer hourly",
      fill: {
        title: "Photographer",
        listingType: "service",
        category: "Photography",
        location: "Auckland",
        price: "120",
        servicePricingType: "hourly",
      },
      must: [/Photograph/i, /Auckland/, /\$120 per hour/i],
      never: [/insured|portfolio|years of experience|equipment provided/i],
      tone: /Photograph|Auckland|per hour/i,
    },
    {
      name: "trailer rental",
      fill: {
        title: "Trailer",
        listingType: "rental",
        rentalSubType: "equipment",
        location: "Auckland",
        rentalPriceDaily: "60",
        price: "60",
      },
      must: [/Trailer|trailer/i, /Auckland/, /\$60(?:\/day| per day)/],
      never: [/bedroom|bond|pet friendly|Rent Trailer For|^Renting out/i],
      tone: /Trailer|Auckland|hire/i,
    },
    {
      name: "pressure washer rental",
      fill: {
        title: "Pressure Washer",
        listingType: "rental",
        rentalSubType: "equipment",
        location: "Christchurch",
        rentalPriceDaily: "45",
        price: "45",
      },
      must: [/Pressure Washer|pressure washer/i, /Christchurch/, /\$45(?:\/day| per day)/],
      never: [/bedroom|WOF|insured/i],
      tone: /Pressure Washer|Christchurch|hire/i,
    },
    {
      name: "couch",
      fill: {
        title: "3 Seater Couch",
        price: "250",
        condition: "Used - Good",
        location: "Christchurch",
        pickupAvailable: true,
        category: "Home",
        listingType: "physical",
      },
      must: [/couch/i, /Christchurch/, /good used condition/i],
      never: [/leather|stain|recliner|Message if interested/i],
      tone: /couch|Christchurch|good used/i,
    },
    {
      name: "wanted PS5",
      fill: {
        title: "PlayStation 5",
        listingType: "wanted",
        location: "Auckland",
        price: "500",
        category: "Gaming",
      },
      must: [/PlayStation|PS5|looking for|wanted|after a/i],
      never: [/pickup is available|I'm selling|brand new PlayStation 5 Console up for grabs/i],
      tone: /Looking for|Wanted:|After a/i,
    },
  ];

  for (const c of suite) {
    it(`${c.name}: ≤1 CTA, grounded, type-aware`, () => {
      const desc = buildListingDescriptionFromFacts(c.fill);
      assertNaturalMarketplaceCopy(desc, {
        sparse: c.name === "wanted PS5",
      });
      assertOneCtaMax(desc);
      for (const re of c.must) expect(desc).toMatch(re);
      for (const re of c.never) expect(desc).not.toMatch(re);
      expect(desc).toMatch(c.tone);
      expect(desc).toMatchSnapshot();
    });
  }
});

describe("service listing description snapshots", () => {
  const serviceCases: Array<{ name: string; fill: SkyAiListingFill; must: RegExp[]; never: RegExp[] }> =
    [
      {
        name: "fixed price lawn mowing",
        fill: {
          title: "Lawn Mowing",
          listingType: "service",
          category: "Trades & Repairs",
          location: "Hamilton",
          price: "50",
          servicePricingType: "fixed",
        },
        must: [/lawn mowing/i, /Hamilton/, /\$50 per job/i],
        never: [/Priced at/i, /per hour/i, /for local jobs/i, /insured|licensed|years of experience/i],
      },
      {
        name: "hourly handyman",
        fill: {
          title: "Handyman",
          listingType: "service",
          category: "Trades & Repairs",
          location: "Auckland",
          price: "65",
          servicePricingType: "hourly",
        },
        must: [/Handyman|handyman/i, /Auckland/, /\$65 per hour/i],
        never: [/Priced at/i, /per job/i, /for local jobs/i, /fully equipped|guaranteed/i],
      },
      {
        name: "quote required cleaning",
        fill: {
          title: "House Cleaning",
          listingType: "service",
          category: "Cleaning & Maintenance",
          location: "Wellington",
          servicePricingType: "request_quote",
        },
        must: [/House Cleaning|house cleaning|cleaning/i, /Wellington/, /quote/i],
        never: [/Priced at/i, /\$\d+ per (job|hour)/i, /for local jobs/i, /insured|bonded/i],
      },
      {
        name: "tutoring with duration fact",
        fill: {
          title: "Maths Tutoring",
          listingType: "service",
          category: "Tutoring & Lessons",
          location: "Christchurch",
          price: "40",
          servicePricingType: "hourly",
          serviceDuration: "1 hour",
        },
        must: [/Maths Tutoring|tutoring/i, /Christchurch/, /\$40 per hour/i, /1 hour/i],
        never: [/Priced at/i, /for local jobs/i, /qualified|certified|years of experience/i],
      },
    ];

  for (const c of serviceCases) {
    it(`${c.name} snapshot`, () => {
      const desc = buildListingDescriptionFromFacts(c.fill);
      assertNaturalMarketplaceCopy(desc);
      assertOneCtaMax(desc);
      for (const re of c.must) expect(desc).toMatch(re);
      for (const re of c.never) expect(desc).not.toMatch(re);
      expect(desc).not.toMatch(META_PHRASE_SMELLS);
      expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
      expect(desc).toMatchSnapshot();
    });
  }
});

describe("sparse listings stay grounded", () => {
  it("legacy phrase-bank stacking is gone from composer", () => {
    const src = readFileSync(join(__dirname, "awhina-listing-description.ts"), "utf8");
    expect(src).not.toMatch(/const BRIDGE_BANK/);
    expect(src).not.toMatch(/const CTA_BANK/);
    expect(src).not.toMatch(/padDescriptionToMinWords/);
    expect(src).toMatch(/extractDescriptionFacts/);
    expect(src).toMatch(/runQualityPass|enforceOneCta/);
  });

  it("product-ux no longer embeds phrase-bank stacking", () => {
    const src = readFileSync(join(__dirname, "awhina-product-ux.ts"), "utf8");
    expect(src).not.toMatch(/const BRIDGE_BANK/);
    expect(src).not.toMatch(/const CTA_BANK/);
    expect(src).toMatch(/awhina-listing-description/);
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
      expect(desc).not.toMatch(/\$\d+|asking|priced at/i);
      assertOneCtaMax(desc);
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
    expect(desc).toMatch(/Hamilton/i);
    expect(desc).toMatch(/pickup/i);
    expect(desc).not.toMatch(/\$900|asking|priced at/i);
    expect(desc).not.toMatch(/Message if interested/i);
    expect(desc).not.toMatch(/Pickup is available in/i);
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
      condition: "Used - Good",
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
    expect(desc).not.toMatch(/\$200|asking|priced at/i);
    assertNaturalMarketplaceCopy(desc);
    assertOneCtaMax(desc);
  });

  it("vehicle one-shot description is category-styled", () => {
    wipe("desc-bmw");
    const r = processCanonicalAwhina(
      "selling my 2018 BMW 320i 85000km Auckland $18500",
      { conversationId: "desc-bmw", pathname: "/" }
    );
    const desc = String(r.listingFill?.description || "");
    expect(desc).toMatch(/BMW/i);
    expect(desc).toMatch(/85,?000|Auckland/i);
    expect(desc).not.toMatch(/\$18,?500|asking|priced at/i);
    expect(desc).not.toMatch(ROBOTIC_SMELLS);
    expect(desc).not.toMatch(META_PHRASE_SMELLS);
    expect(desc).not.toMatch(UNGROUNDED_CLAIM_SMELLS);
    assertOneCtaMax(desc);
  });
});

describe("live oneshot human-seller regressions", () => {
  it("cleanRentalItemName strips rent/for hire verb debris", () => {
    expect(cleanRentalItemName("Rent Trailer For")).toBe("Trailer");
    expect(cleanRentalItemName("trailer for hire")).toMatch(/^trailer$/i);
    expect(cleanRentalItemName("Renting out my generator")).toMatch(/^generator$/i);
  });

  it("rental oneshot: trailer hire — clean item name, human rate + dates CTA", () => {
    wipe("live-rental-trailer");
    const r = processCanonicalAwhina("rent my trailer for $60 a day Auckland", {
      conversationId: "live-rental-trailer",
      pathname: "/",
    });
    expect(r.listingFill?.listingType).toBe("rental");
    expect(r.listingFill?.price).toBe("60");
    expect(String(r.listingFill?.title || "")).toMatch(/^Trailer$/i);
    expect(String(r.listingFill?.title || "")).not.toMatch(/rent|for hire|^for\b/i);
    const desc = String(r.listingFill?.description || "");
    expect(desc).toMatch(/Trailer/i);
    expect(desc).not.toMatch(/Rent Trailer For/i);
    expect(desc).toMatch(/Auckland/i);
    expect(desc).toMatch(/\$60 per day|\$60\/day/i);
    expect(desc).toMatch(/hire|rent/i);
    expect(desc).not.toMatch(/^Looking for/i);
    assertOneCtaMax(desc);
    assertNaturalMarketplaceCopy(desc);
  });

  it("service oneshot: never opens with Looking for (seller offer voice)", () => {
    wipe("live-service-lawn");
    const r = processCanonicalAwhina("I mow lawns for $50", {
      conversationId: "live-service-lawn",
      pathname: "/",
    });
    expect(r.listingFill?.listingType).toBe("service");
    expect(r.listingFill?.price).toBe("50");
    const desc = String(r.listingFill?.description || "");
    expect(desc).not.toMatch(/^Looking for\b/i);
    expect(desc).toMatch(/lawn mowing/i);
    expect(desc).not.toMatch(/\$50|asking|priced at/i);
    expect(desc).toMatch(/available/i);
    assertOneCtaMax(desc);
    assertNaturalMarketplaceCopy(desc);
  });

  it("physical iPhone oneshot: bare 900 lands in listingFill.price", () => {
    wipe("live-iphone-900");
    expect(parseListingPriceFromMessage("selling iPhone 15 Pro 128GB 900 Hamilton")).toBe(
      "900"
    );
    const r = processCanonicalAwhina("selling iPhone 15 Pro 128GB 900 Hamilton", {
      conversationId: "live-iphone-900",
      pathname: "/",
    });
    expect(r.listingFill?.listingType).toBe("physical");
    expect(r.listingFill?.price).toBe("900");
    expect(String(r.listingFill?.title || "")).toMatch(/iPhone/i);
    expect(String(r.listingFill?.title || "")).not.toMatch(/\b900\b/);
    const desc = String(r.listingFill?.description || "");
    // Price may appear once naturally OR be omitted; structured field must keep it
    expect(r.listingFill?.price).toBe("900");
    assertOneCtaMax(desc);
    assertNaturalMarketplaceCopy(desc);
  });

  it("facts from dirty rental title still write clean item", () => {
    const facts = extractDescriptionFacts({
      title: "Rent Trailer For",
      listingType: "rental",
      rentalSubType: "equipment",
      location: "Auckland",
      rentalPriceDaily: "60",
      price: "60",
    });
    expect(facts.item).toMatch(/^Trailer$/i);
    const desc = buildListingDescriptionFromFacts({
      title: "Rent Trailer For",
      listingType: "rental",
      rentalSubType: "equipment",
      location: "Auckland",
      rentalPriceDaily: "60",
      price: "60",
    });
    expect(desc).not.toMatch(/Rent Trailer For/i);
    expect(desc).toMatch(/Trailer/i);
  });
});

describe("vehicle composer — readiness + no seller coaching in buyer desc", () => {
  const SELLER_LEAK =
    /complete the listing|still need|add the remaining|add photos|publish when ready|fill in/i;

  const vehicles: Array<{
    name: string;
    message: string;
    titleRe: RegExp;
    make: string;
    model: string;
    neverTrim?: RegExp;
    askGeneration?: boolean;
  }> = [
    {
      name: "Nissan Skyline",
      message: "sell my skyline",
      titleRe: /Nissan\s+Skyline/i,
      make: "Nissan",
      model: "Skyline",
      neverTrim: /\b(GT-?R|GTT|V-?Spec|Nismo)\b/i,
      askGeneration: true,
    },
    {
      name: "BMW 335i",
      message: "sell my bmw 335i",
      titleRe: /BMW\s+335i/i,
      make: "BMW",
      model: "335i",
    },
    {
      name: "Toyota Supra",
      message: "sell my supra",
      titleRe: /Toyota\s+Supra/i,
      make: "Toyota",
      model: "Supra",
      askGeneration: true,
    },
    {
      name: "Ford Ranger",
      message: "sell my ranger",
      titleRe: /Ford\s+Ranger/i,
      make: "Ford",
      model: "Ranger",
    },
  ];

  for (const v of vehicles) {
    it(`${v.name}: sparse seed → title only, blank buyer desc, seller ask`, () => {
      wipe(`veh-${v.name.replace(/\s+/g, "-").toLowerCase()}`);
      const r = processCanonicalAwhina(v.message, {
        conversationId: `veh-${v.name.replace(/\s+/g, "-").toLowerCase()}`,
        pathname: "/",
      });
      expect(r.listingFill?.listingType).toBe("vehicle");
      expect(r.listingFill?.vehicleMake).toBe(v.make);
      expect(String(r.listingFill?.vehicleModel || "")).toMatch(
        new RegExp(v.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      );
      expect(String(r.listingFill?.title || "")).toMatch(v.titleRe);
      if (v.neverTrim) {
        expect(String(r.listingFill?.title || "")).not.toMatch(v.neverTrim);
      }
      const desc = String(r.listingFill?.description || "");
      expect(desc.trim()).toBe("");
      expect(desc).not.toMatch(SELLER_LEAK);
      expect(String(r.reply || "")).toMatch(/I've started/i);
      if (v.askGeneration) {
        expect(String(r.reply || "")).toMatch(/generation/i);
        expect(String(r.reply || "")).not.toMatch(/\bprice\b.*\bcondition\b.*\blocation\b/i);
      } else {
        expect(String(r.reply || "")).toMatch(/year/i);
      }
    });
  }

  it("sell my skyline → ask generation; then R34 → 1999 → 30000 → good Auckland → premium desc", () => {
    wipe("veh-skyline-regression");
    const id = "veh-skyline-regression";
    const first = processCanonicalAwhina("sell my skyline", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(first.listingFill?.listingType).toBe("vehicle");
    expect(first.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(first.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(first.listingFill?.title || "")).toMatch(/Nissan\s+Skyline/i);
    expect(String(first.listingFill?.title || "")).not.toMatch(/GT-?R|GTT/i);
    expect(String(first.listingFill?.description || "").trim()).toBe("");
    expect(String(first.reply || "")).toMatch(/R32|R33|R34|generation/i);
    expect(String(first.reply || "")).not.toMatch(SELLER_LEAK);

    const withGen = processCanonicalAwhina("R34", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: first.listingFill as never,
    });
    expect(String(withGen.listingFill?.vehicleModel || "")).toMatch(/^Skyline$/i);
    expect(String(withGen.listingFill?.vehicleGeneration || "")).toMatch(/R34/i);
    expect(String(withGen.listingFill?.title || "")).toMatch(/Nissan\s+Skyline\s+R34/i);
    expect(String(withGen.listingFill?.description || "").trim()).toBe("");
    expect(String(withGen.reply || "")).toMatch(/year/i);

    const withYear = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withGen.listingFill as never,
    });
    expect(withYear.listingFill?.vehicleYear).toBe("1999");
    expect(String(withYear.listingFill?.description || "").trim()).toBe("");
    expect(String(withYear.reply || "")).toMatch(/price|asking/i);

    const withPrice = processCanonicalAwhina("30000", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withYear.listingFill as never,
    });
    expect(withPrice.listingFill?.price).toBe("30000");
    expect(String(withPrice.listingFill?.description || "").trim()).toBe("");

    const rich = processCanonicalAwhina("good condition Auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withPrice.listingFill as never,
    });
    const desc = String(rich.listingFill?.description || "");
    expect(desc.trim().length).toBeGreaterThan(40);
    expect(desc).toMatch(/1999|Nissan|Skyline|R34/i);
    expect(desc).toMatch(/Auckland/i);
    expect(desc).not.toMatch(/\$30,?000|\$30000|asking|priced at/i);
    expect(desc).toMatch(/good/i);
    expect(desc).not.toMatch(SELLER_LEAK);
    expect(desc).not.toMatch(SELLER_EDITOR_GUIDANCE_RE);
    assertOneCtaMax(desc);
    assertNaturalMarketplaceCopy(desc);
  });

  it("rich one-shot 1999 Nissan Skyline R34 → premium title + buyer desc", () => {
    wipe("veh-skyline-oneshot");
    const r = processCanonicalAwhina(
      "sell my 1999 Nissan Skyline R34 Auckland $30000 good condition",
      { conversationId: "veh-skyline-oneshot", pathname: "/" }
    );
    expect(r.listingFill?.listingType).toBe("vehicle");
    expect(r.listingFill?.vehicleMake).toBe("Nissan");
    expect(String(r.listingFill?.vehicleModel || "")).toMatch(/Skyline/i);
    expect(
      String(r.listingFill?.vehicleGeneration || r.listingFill?.vehicleModel || "")
    ).toMatch(/R34/i);
    expect(r.listingFill?.vehicleYear).toBe("1999");
    expect(String(r.listingFill?.title || "")).toMatch(/1999.*Nissan.*Skyline.*R34/i);
    expect(String(r.listingFill?.title || "")).not.toMatch(/GT-?R|GTT/i);
    const desc = String(r.listingFill?.description || "");
    expect(desc.trim().length).toBeGreaterThan(40);
    expect(desc).toMatch(/1999|Nissan|Skyline|R34/i);
    expect(desc).toMatch(/Auckland/i);
    expect(desc).not.toMatch(/\$30,?000|\$30000|asking|priced at/i);
    expect(desc).not.toMatch(SELLER_LEAK);
    assertNaturalMarketplaceCopy(desc);
  });

  it("sparse R34 seed: blank buyer desc — no complete-the-listing leak", () => {
    wipe("veh-skyline-quality");
    const r = processCanonicalAwhina("sell my skyline r34", {
      conversationId: "veh-skyline-quality",
      pathname: "/",
    });
    expect(r.listingFill?.title).toMatch(/Nissan\s+Skyline\s+R34/i);
    expect(String(r.listingFill?.description || "").trim()).toBe("");
    expect(String(r.reply || "")).toMatch(/year/i);
    expect(String(r.reply || "")).not.toMatch(SELLER_LEAK);
    expect("").toMatchSnapshot();
  });

  it("field updates stay blank until readiness threshold, then premium copy", () => {
    wipe("veh-skyline-followup");
    const id = "veh-skyline-followup";
    const first = processCanonicalAwhina("sell my skyline r34", {
      conversationId: id,
      pathname: "/post/ai",
    });
    expect(first.listingFill?.title).toMatch(/Nissan\s+Skyline\s+R34/i);
    expect(String(first.listingFill?.description || "").trim()).toBe("");

    const withYear = processCanonicalAwhina("1999", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: first.listingFill as never,
    });
    expect(String(withYear.listingFill?.description || "").trim()).toBe("");

    const withPrice = processCanonicalAwhina("12000", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withYear.listingFill as never,
    });
    expect(String(withPrice.listingFill?.description || "").trim()).toBe("");

    const withCond = processCanonicalAwhina("Good condition", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withPrice.listingFill as never,
    });
    expect(String(withCond.listingFill?.description || "").trim()).toBe("");

    const withLoc = processCanonicalAwhina("Auckland", {
      conversationId: id,
      pathname: "/post/ai",
      listingContext: withCond.listingFill as never,
    });
    const d4 = String(withLoc.listingFill?.description || "");
    expect(d4).toMatch(/Auckland/i);
    expect(d4).not.toMatch(/\$12,?000|\$12000|asking|priced at/i);
    expect(d4).toMatch(/good used condition|good condition/i);
    expect(d4).not.toMatch(SELLER_LEAK);
    assertOneCtaMax(d4);
  });

  it("facts writer leaves sparse vehicles blank; rich R34 is premium", () => {
    for (const fill of [
      {
        title: "Nissan Skyline R34",
        listingType: "vehicle" as const,
        vehicleMake: "Nissan",
        vehicleModel: "Skyline R34",
      },
      {
        title: "BMW 335i",
        listingType: "vehicle" as const,
        vehicleMake: "BMW",
        vehicleModel: "335i",
      },
      {
        title: "Toyota Supra",
        listingType: "vehicle" as const,
        vehicleMake: "Toyota",
        vehicleModel: "Supra",
      },
      {
        title: "Ford Ranger",
        listingType: "vehicle" as const,
        vehicleMake: "Ford",
        vehicleModel: "Ranger",
      },
    ]) {
      expect(getVehicleDraftReadiness(fill).worthGeneratingBuyerCopy).toBe(false);
      expect(buildListingDescriptionFromFacts(fill)).toBe("");
    }

    const rich = buildListingDescriptionFromFacts({
      title: "1999 Nissan Skyline R34",
      listingType: "vehicle",
      vehicleYear: "1999",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline R34",
      price: "30000",
      condition: "Used - Good",
      location: "Auckland",
    });
    expect(rich).toMatch(/1999|Nissan|Skyline|R34/i);
    expect(rich).toMatch(/Auckland/);
    expect(rich).not.toMatch(/\$30,?000|asking|priced at/i);
    expect(rich).not.toMatch(SELLER_LEAK);
    assertNaturalMarketplaceCopy(rich);
  });

  it("rich BMW 335i one-shot uses confirmed facts — never Item filler", () => {
    wipe("rich-bmw-335i");
    const msg =
      "sell my 2007 bmw 335i coupe for 18k, done 145000kms, automatic, grey, modified with upgraded twin turbos intercooler downpipes and intakes, cars in auckland and its in good condition";
    const r = processCanonicalAwhina(msg, {
      conversationId: "rich-bmw-335i",
      pathname: "/",
    });
    expect(r.listingFill?.listingType).toBe("vehicle");
    expect(r.listingFill?.vehicleMake).toBe("BMW");
    expect(r.listingFill?.vehicleModel).toMatch(/335i/i);
    expect(r.listingFill?.vehicleYear).toBe("2007");
    expect(r.listingFill?.vehicleOdometer).toBe("145000");
    expect(r.listingFill?.vehicleColour).toMatch(/grey/i);
    expect(r.listingFill?.vehicleTransmission).toMatch(/automatic/i);
    expect(r.listingFill?.vehicleBodyType).toMatch(/coupe/i);
    expect(r.listingFill?.price).toBe("18000");
    const extras = Array.isArray(r.listingFill?.extras)
      ? r.listingFill!.extras!.join(" ")
      : "";
    expect(extras).toMatch(/twin turbos/i);
    expect(extras).toMatch(/intercooler/i);
    expect(extras).toMatch(/downpipes/i);
    expect(extras).toMatch(/intakes/i);
    const desc = String(r.listingFill?.description || "");
    expect(desc).not.toMatch(/^Item\b/i);
    expect(desc).not.toMatch(/Item in good used condition/i);
    expect(desc).toMatch(/2007/);
    expect(desc).toMatch(/BMW/i);
    expect(desc).toMatch(/335i/i);
    expect(desc).toMatch(/coupe/i);
    expect(desc).toMatch(/145,?000/);
    expect(desc).toMatch(/grey|gray/i);
    expect(desc).toMatch(/automatic/i);
    expect(desc).toMatch(/twin turbos/i);
    expect(desc).not.toMatch(/\$18,?000|asking|priced at/i);
    expect(desc).not.toMatch(/\bWOF\b|\bwarranty\b|\bservice history\b/i);
    assertNaturalMarketplaceCopy(desc);

    const rewritten = processCanonicalAwhina("write a better description", {
      conversationId: "rich-bmw-335i",
      pathname: "/",
      listingContext: r.listingFill as never,
    });
    const desc2 = String(rewritten.listingFill?.description || "");
    expect(desc2).not.toMatch(/^Item\b|^Write a better description\b/i);
    expect(desc2).toMatch(/BMW/i);
    expect(desc2).toMatch(/145,?000/);
    expect(desc2).toMatch(/twin turbos/i);
    expect(rewritten.listingFill?.vehicleOdometer).toBe("145000");
  });

  it("description layer: dirty iPhone title → clean prose, no Like-new vs scratches", () => {
    // Confirmed draft shape that extraction currently produces (description-only fix)
    const dirtyTitle =
      "Like New iPhone 15 Pro 256gb Black, Couple Scratches ON Sides But";
    const desc = buildListingDescriptionFromFacts({
      title: dirtyTitle,
      condition: "Used - Like New",
      price: "900",
      location: "Henderson, Auckland",
      pickupAvailable: true,
      listingType: "physical",
      category: "Tech",
      extras: [
        "256GB",
        "black",
        "Couple scratches on the sides",
        "Screen is mint",
        "Battery health 89%",
      ],
    });
    expect(desc).not.toMatch(/like-new|like new/i);
    expect(desc).not.toMatch(/Couple Scratches ON Sides But/i);
    expect(desc).not.toMatch(/,\s*Couple Scratches/i);
    expect(desc).toMatch(/iPhone\s*15\s*Pro/i);
    expect(desc).toMatch(/256\s*GB/i);
    expect(desc).toMatch(/black/i);
    expect(desc).toMatch(/scratch/i);
    expect(desc).toMatch(/screen/i);
    expect(desc).toMatch(/89\s*%/);
    expect(desc).toMatch(/Henderson|Auckland/i);
    expect(desc).not.toMatch(/\$900|asking|priced at/i);
    expect(desc).toMatch(/pickup/i);
    assertNaturalMarketplaceCopy(desc);
  });

  it("description layer: lifts scratch clause from dirty title when extras sparse", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Like New iPhone 15 Pro 256gb Black, Couple Scratches ON Sides But",
      condition: "Used - Like New",
      price: "900",
      location: "Auckland",
      pickupAvailable: true,
      listingType: "physical",
      category: "Tech",
      extras: ["256GB", "black"],
    });
    expect(desc).not.toMatch(/like-new|Like-new/i);
    expect(desc).not.toMatch(/Couple Scratches ON Sides But/i);
    expect(desc).toMatch(/scratch/i);
    expect(desc).toMatch(/256\s*GB/i);
    expect(desc).not.toMatch(/\$900|asking|priced at/i);
    assertNaturalMarketplaceCopy(desc);
  });

  it("sparse listing may use generic condition copy", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Item",
      listingType: "physical",
      condition: "Used - Good",
      location: "Auckland",
      price: "50",
      pickupAvailable: true,
    });
    expect(desc).toMatch(/Auckland|\$50/);
    assertNaturalMarketplaceCopy(desc, { sparse: true });
  });

  it("getVehicleDraftReadiness prioritises generation before price", () => {
    const sparse = getVehicleDraftReadiness({
      title: "Nissan Skyline",
      listingType: "vehicle",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline",
    });
    expect(sparse.identityComplete).toBe(false);
    expect(sparse.worthGeneratingBuyerCopy).toBe(false);
    expect(sparse.nextClarification).toMatch(/R32|R33|R34|generation/i);
    expect(sparse.importantMissing[0]).toBe("generation");
  });
});

describe("semantic description quality — Barella card + cross-domain", () => {
  it("Barella Topps Chrome: natural prose, no field dumps / CTA filler / Chrome Topps", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Nicolò Barella Chrome Topps",
      listingType: "physical",
      condition: "Used - Good",
      category: "Sports",
      extras: [
        "subject:Nicolò Barella",
        "set:Topps Chrome",
        "manufacturer:Topps",
        "serial:14/25",
      ],
    });
    expect(desc).toMatch(/Nicol[oò] Barella/i);
    expect(desc).toMatch(/Topps Chrome/i);
    expect(desc).toMatch(/numbered\s+14\/25/i);
    expect(desc).toMatch(/good used condition/i);
    expect(desc).not.toMatch(/Chrome\s+Topps/i);
    expect(desc).not.toMatch(/\bSet\s+Topps/i);
    expect(desc).not.toMatch(/(?:^|\.\s+)Topps\./i);
    expect(desc).not.toMatch(/Message if interested/i);
    expect(desc).not.toMatch(/Attr:/i);
    // Player must not be its own trailing sentence after the opener
    expect(desc).not.toMatch(/Nicol[oò] Barella\.\s+Set/i);
    expect(desc).not.toMatch(/Nicol[oò] Barella\.\s+Nicol/i);
    // Semantic: one coherent identity phrase, not metadata serialization
    const sentences = desc.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(validateDescription(desc, { expectedProductLine: "Topps Chrome" }).ok).toBe(
      true
    );
  });

  it("phone: identity + condition + logistics without Attr dumps", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Apple iPhone 15 Pro 256GB",
      listingType: "physical",
      condition: "Used - Good",
      location: "Auckland",
      price: "1100",
      pickupAvailable: true,
      category: "Tech",
      extras: ["storage:256GB"],
    });
    expect(desc).toMatch(/iPhone\s*15\s*Pro/i);
    expect(desc).toMatch(/good used condition/i);
    expect(desc).toMatch(/Auckland/);
    expect(desc).not.toMatch(/\$1,?100|asking|priced at/i);
    expect(desc).not.toMatch(/Attr:|Message if interested|Set\s+/i);
    assertNaturalMarketplaceCopy(desc);
  });

  it("gaming mouse: grounded physical copy", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Razer DeathAdder V3",
      listingType: "physical",
      condition: "Used - Like New",
      location: "Wellington",
      price: "80",
      pickupAvailable: true,
      category: "Gaming",
    });
    expect(desc).toMatch(/Razer|DeathAdder/i);
    expect(desc).toMatch(/Wellington/);
    expect(desc).not.toMatch(/\$80|asking|priced at/i);
    expect(desc).not.toMatch(/Message if interested|Attr:|Set\s+/i);
    assertNaturalMarketplaceCopy(desc);
  });

  it("vehicle: structured specs without field labels", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "2015 Mazda Axela",
      listingType: "vehicle",
      vehicleYear: "2015",
      vehicleMake: "Mazda",
      vehicleModel: "Axela",
      vehicleOdometer: "128000",
      vehicleColour: "Blue",
      vehicleTransmission: "Automatic",
      price: "11500",
      location: "Auckland",
      condition: "Used - Good",
    });
    expect(desc).toMatch(/Mazda|Axela/i);
    expect(desc).toMatch(/128,?000/);
    expect(desc).toMatch(/Auckland/);
    expect(desc).not.toMatch(/Condition:|Odometer:|Attr:|Set\s+/i);
    assertNaturalMarketplaceCopy(desc);
  });
});

describe("authoritative description boundary regressions", () => {
  it("replaces raw model prose with the canonical composer across card, controller, mouse, phone, and car", () => {
    const cases: Array<{
      name: string;
      fill: SkyAiListingFill;
      must: RegExp[];
      never: RegExp[];
    }> = [
      {
        name: "Barella card",
        fill: {
          title: "Nicolò Barella Chrome Topps",
          listingType: "physical",
          category: "Sports",
          condition: "Used - Good",
          extras: [
            "subject:Nicolò Barella",
            "set:Topps Chrome",
            "manufacturer:Topps",
            "serial:14/25",
          ],
          description: "Attr: subject=Nicolò Barella. Set: Topps Chrome. Message if interested.",
        },
        must: [/Nicol[oò] Barella/i, /Topps Chrome/i, /numbered 14\/25/i, /good used condition/i],
        never: [
          /Chrome Topps/i,
          /\bSet\s*:/i,
          /Attr:|visionFact|confidence/i,
          /Message if interested/i,
          CTA_PURPOSE_RE,
        ],
      },
      {
        name: "DualSense controller",
        fill: {
          title: "Pink Sony DualSense Wireless Controller for PS5",
          listingType: "physical",
          category: "Gaming",
          condition: "New",
          description: "Price: $120. Location: Auckland. Brand: Sony.",
        },
        must: [/brand new/i, /Sony DualSense/i, /PS5/i],
        never: [/\$120|Auckland|Price:|Location:|Attr:|Set\s+|Chrome\s+Topps/i, CTA_PURPOSE_RE],
      },
      {
        name: "Razer mouse",
        fill: {
          title: "Razer DeathAdder V3 Wireless Gaming Mouse",
          listingType: "physical",
          category: "Gaming",
          condition: "Used - Good",
          description: "Brand: Razer. Product: DeathAdder V3. Condition: good.",
        },
        must: [/Razer DeathAdder V3/i, /wireless gaming mouse/i, /good used condition/i],
        never: [/Brand:|Product:|Condition:|Attr:|Set\s+|Chrome\s+Topps/i, CTA_PURPOSE_RE],
      },
      {
        name: "iPhone",
        fill: {
          title: "Apple iPhone 15 Pro 256GB",
          listingType: "physical",
          category: "Tech",
          condition: "Used - Good",
          description: "Attr: storage=256GB. confidence: 0.9.",
        },
        must: [/iPhone 15 Pro/i, /256GB/i, /good used condition/i],
        never: [/Attr:|confidence|storage=|Set\s+|Chrome\s+Topps/i, CTA_PURPOSE_RE],
      },
      {
        name: "Mazda",
        fill: {
          title: "2015 Mazda Axela",
          listingType: "vehicle",
          vehicleYear: "2015",
          vehicleMake: "Mazda",
          vehicleModel: "Axela",
          vehicleOdometer: "128000",
          vehicleColour: "Blue",
          vehicleTransmission: "Automatic",
          condition: "Used - Good",
          description: "Year: 2015. Odometer: 128000. Attr: blue.",
        },
        must: [/2015 Mazda Axela/i, /128,?000 km/i, /good used condition/i],
        never: [/Year:|Odometer:|Attr:|Set\s+|Chrome\s+Topps/i, CTA_PURPOSE_RE],
      },
    ];

    for (const c of cases) {
      const final = finalizeAwhinaListingDescription(c.fill);
      expect(final.descriptionSource).toBe("ai");
      expect(final.description).not.toBe(c.fill.description);
      for (const re of c.must) expect(final.description).toMatch(re);
      for (const re of c.never) expect(final.description).not.toMatch(re);
      const validation = validateDescription(final.description);
      expect(
        validation.ok,
        `${c.name}: ${validation.reason || "unexpected validation failure"} — ${final.description}`
      ).toBe(true);
    }
  });

  it("does not overwrite seller-authored copy until a rewrite is requested", () => {
    const fill: SkyAiListingFill = {
      title: "Razer DeathAdder V3",
      listingType: "physical",
      condition: "Used - Good",
      description: "My own careful description.",
      descriptionSource: "user",
    };
    expect(finalizeAwhinaListingDescription(fill).description).toBe(fill.description);
    expect(finalizeAwhinaListingDescription(fill, { force: true }).description).not.toBe(
      fill.description
    );
  });

  it("writes a card bundle from canonical facts without serializing the price", () => {
    const fill: SkyAiListingFill = {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      category: "Collectibles",
      price: "100",
      extras: [
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor",
        "set:Egyptian God Cards",
        "bundle_quantity:3",
      ],
    };

    const facts = extractDescriptionFacts(fill);
    expect(facts.bundleQuantity).toBe(3);
    expect(facts.extras.join(" ")).not.toMatch(/bundle_quantity/i);
    expect(fill.extras).toContain("bundle_quantity:3");

    const initial = finalizeAwhinaListingDescription(fill);
    expect(initial.description).toMatch(
      /Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor\./
    );
    expect(initial.description).not.toMatch(/\$100|asking|priced at/i);
    expect(initial.description).not.toMatch(/bundle_quantity|Bundle_quantity|:3\b/i);
    const initialValidation = validateDescription(initial.description);
    expect(initialValidation.ok, initialValidation.reason).toBe(true);

    const conditioned = finalizeAwhinaListingDescription({
      ...fill,
      condition: "Used - Good",
      description: initial.description,
      descriptionSource: "ai",
    });
    expect(conditioned.description).toMatch(
      /All three cards are in good used condition and are being sold together as a set\./i
    );
    expect(conditioned.description).not.toMatch(/\$100|asking|priced at/i);
    expect(conditioned.description).not.toMatch(/bundle_quantity|Bundle_quantity|:3\b/i);
    expect(String(conditioned.description).trim()).toBe(
      "Set of three Yu-Gi-Oh! Egyptian God Cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set."
    );
  });

  it("never appends raw structured quantity after natural set prose", () => {
    const fill: SkyAiListingFill = {
      title: "Yu-Gi-Oh! Cards",
      listingType: "physical",
      condition: "Used - Good",
      extras: [
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
        "set:Yu-Gi-Oh!",
        "bundle_quantity:3",
      ],
    };
    const description = String(finalizeAwhinaListingDescription(fill).description || "");
    expect(description).toMatch(/Set of three/i);
    expect(description).not.toMatch(/bundle_quantity/i);
    expect(description).not.toMatch(/Bundle_quantity/i);
    expect(description).not.toMatch(/:3/);
    expect(description).toBe(
      "Set of three Yu-Gi-Oh! cards featuring The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor. All three cards are in good used condition and are being sold together as a set."
    );
  });

  it("keeps sealed product identity atomic instead of concatenating product-line facts", () => {
    const fill: SkyAiListingFill = {
      title: "Riftbound League of Legends Unleashed booster box",
      listingType: "physical",
      category: "Collectibles",
      condition: "New",
      extras: [
        "objectType:booster_box",
        "manufacturer:Riftbound",
        "set:Riftbound Unleashed",
        "league:League of Legends",
        "productFormat:booster box",
      ],
    };

    const description = String(finalizeAwhinaListingDescription(fill).description || "");
    expect(description).toBe(
      "Brand new Riftbound League of Legends Unleashed booster box."
    );
    expect(description).not.toMatch(/Riftbound Unleashed.*Riftbound Unleashed/i);
    expect(validateDescription(description).ok, description).toBe(true);

    const broken =
      "Brand new Riftbound League of Legends Unleashed booster box Riftbound Unleashed.";
    expect(passesListingDescriptionQualityGate(broken)).toBe(false);
    expect(validateDescription(broken).ok).toBe(false);
  });

  it("keeps the universal identifier as facts across marketplace domains", () => {
    const cases: Array<{ name: string; fill: SkyAiListingFill; identity: RegExp }> = [
      {
        name: "Topps sealed product",
        fill: {
          title: "Topps Premier League 2024 booster box",
          listingType: "physical",
          category: "Collectibles",
          condition: "New",
          extras: [
            "objectType:booster_box",
            "manufacturer:Topps",
            "set:Topps Premier League",
            "productFormat:booster box",
          ],
        },
        identity: /Topps Premier League 2024 booster box/i,
      },
      {
        name: "iPhone",
        fill: {
          title: "Apple iPhone 15 Pro 256GB",
          listingType: "physical",
          category: "Tech",
          condition: "Used - Good",
        },
        identity: /iPhone 15 Pro 256GB/i,
      },
      {
        name: "PS5",
        fill: {
          title: "PlayStation 5 Console",
          listingType: "physical",
          category: "Gaming",
          condition: "Used - Good",
        },
        identity: /PlayStation 5 Console/i,
      },
      {
        name: "BMW",
        fill: {
          title: "2018 BMW 330i",
          listingType: "vehicle",
          category: "Cars",
          condition: "Used - Good",
          price: "35000",
          vehicleYear: "2018",
          vehicleMake: "BMW",
          vehicleModel: "330i",
          vehicleOdometer: "65000",
          vehicleTransmission: "Automatic",
          location: "Auckland",
        },
        identity: /2018 BMW 330i/i,
      },
      {
        name: "Nike shoes",
        fill: {
          title: "Nike Air Force 1",
          listingType: "physical",
          category: "Fashion",
          condition: "Used - Good",
        },
        identity: /Nike Air Force 1/i,
      },
    ];

    for (const c of cases) {
      const description = String(finalizeAwhinaListingDescription(c.fill).description || "");
      expect(description, c.name).toMatch(c.identity);
      expect(description, c.name).not.toMatch(/(?:objectType|manufacturer|productFormat|set):/i);
      expect(description, c.name).not.toMatch(/Riftbound Unleashed.*Riftbound Unleashed/i);
    }
  });

  it("never leaks structured metadata keys into public descriptions", () => {
    const fill: SkyAiListingFill = {
      title: "Nike Air Force 1",
      listingType: "physical",
      condition: "Used - Good",
      extras: [
        "brand:Nike",
        "listing_type:physical",
        "domain:footwear",
        "condition_code:good",
        "vision_confidence:HIGH",
        "provenance:IMAGE",
        "field_source:vision",
        "bundle_quantity:2",
      ],
    };
    const desc = finalizeAwhinaListingDescription(fill).description;
    expect(desc).not.toMatch(
      /brand:|listing_type:|domain:|condition_code:|vision_confidence:|provenance:|field_source:|bundle_quantity:/i
    );
    expect(
      stripStructuredMetadataLeakage(
        "Nice shoes. brand:Nike. listing_type:physical. Bundle_quantity:2."
      )
    ).toBe("Nice shoes.");
    expect(
      validateAiListingDescription(
        "Pair of Nike Air Force 1 shoes in good used condition. Both shoes are being sold together. Bundle_quantity:2.",
        buildDescriptionWriterFacts(fill)
      )
    ).toMatch(
      /^Pair of Nike Air Force 1 shoes in good used condition\. Both shoes are being sold together\.$/
    );
  });

  it("treats a price for a pictured card set as price plus bundle context, then asks condition", () => {
    const draft: SkyAiListingFill = {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      category: "Collectibles",
      extras: [
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor",
        "set:Egyptian God Cards",
      ],
    };
    const turn = processListingFillMessage("100 for all three", {
      pathname: "/post/ai",
      listingContext: draft,
      pendingClarification: {
        kind: "listing_slots",
        pendingSlot: "price",
        priorMessage: "What is the asking price?",
        askedAt: Date.now(),
      },
    });

    expect(turn.handled).toBe(true);
    if (!turn.handled || !turn.listingFill) return;
    expect(turn.listingFill.price).toBe("100");
    expect(turn.listingFill.extras).toContain("bundle_quantity:3");
    expect(turn.listingFill.description).not.toMatch(/\$100|asking|priced at/i);
    expect(turn.reply).toMatch(/\$100 for all 3/i);
    expect(turn.reply).toMatch(/What condition is it in\?/i);
    expect(buildReadinessFollowUpReply(turn.listingFill)).toMatch(
      /What condition is it in\?/i
    );
  });

  it("regenerates an active AI-owned description from canonical facts on request", () => {
    const oldDescription =
      "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!, asking $100.";
    const turn = processListingFillMessage("update description", {
      pathname: "/post/ai",
      listingContext: {
        title:
          "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
        listingType: "physical",
        category: "Collectibles",
        price: "100",
        condition: "Used - Good",
        description: oldDescription,
        extras: [
          "subject:The Winged Dragon of Ra, Slifer the Sky Dragon and Obelisk the Tormentor",
          "set:Egyptian God Cards",
          "bundle_quantity:3",
        ],
      },
    });

    expect(turn.handled).toBe(true);
    if (!turn.handled || !turn.listingFill) return;
    expect(turn.listingFill.description).not.toBe(oldDescription);
    expect(turn.listingFill.description).toMatch(
      /Set of three Yu-Gi-Oh! Egyptian God Cards/i
    );
    expect(turn.listingFill.description).toMatch(/All three cards are in good used condition/i);
    expect(turn.listingFill.description).not.toMatch(/\$100|asking|priced at/i);
    expect(turn.reply).toMatch(/updated the description/i);
  });

  it("keeps structured prices out of final buyer copy across listing domains", () => {
    const cases: Array<{ name: string; fill: SkyAiListingFill; must: RegExp }> = [
      {
        name: "Topps Chrome card",
        fill: {
          title: "2023 Topps Chrome Erling Haaland",
          listingType: "physical",
          category: "Collectibles",
          condition: "Used - Good",
          price: "125",
          extras: ["subject:Erling Haaland", "set:2023 Topps Chrome"],
        },
        must: /Erling Haaland/i,
      },
      {
        name: "DualSense",
        fill: {
          title: "Sony DualSense Wireless Controller",
          listingType: "physical",
          category: "Gaming",
          condition: "Used - Good",
          price: "80",
          extras: ["colour:Midnight Black"],
        },
        must: /DualSense/i,
      },
      {
        name: "Razer mouse",
        fill: {
          title: "Razer DeathAdder V3 Wireless Gaming Mouse",
          listingType: "physical",
          category: "Gaming",
          condition: "Used - Good",
          price: "95",
        },
        must: /DeathAdder/i,
      },
      {
        name: "Marin mountain bike",
        fill: {
          title: "Marin Bobcat Trail Mountain Bike",
          listingType: "physical",
          category: "Sports",
          condition: "Used - Good",
          price: "700",
        },
        must: /Marin/i,
      },
      {
        name: "iPhone",
        fill: {
          title: "Apple iPhone 15 Pro 256GB",
          listingType: "physical",
          category: "Tech",
          condition: "Used - Good",
          price: "900",
        },
        must: /iPhone 15 Pro/i,
      },
      {
        name: "car",
        fill: {
          title: "2018 Mazda Axela",
          listingType: "vehicle",
          category: "Cars",
          vehicleYear: "2018",
          vehicleMake: "Mazda",
          vehicleModel: "Axela",
          vehicleOdometer: "85000",
          vehicleTransmission: "Automatic",
          condition: "Used - Good",
          price: "12500",
          location: "Auckland",
        },
        must: /85,?000 km/i,
      },
    ];

    for (const c of cases) {
      const description = finalizeAwhinaListingDescription(c.fill).description;
      expect(description, c.name).toMatch(c.must);
      expect(description, c.name).not.toMatch(/\$\d|(?:asking|priced at)\s+\$/i);
      expect(validateDescription(description).ok, `${c.name}: ${description}`).toBe(true);
    }
  });
});
