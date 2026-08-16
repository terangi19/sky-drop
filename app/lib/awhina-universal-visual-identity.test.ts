/**
 * Universal visual identifier regressions — structured observation fixtures.
 * Proves cross-domain identity (not TCG-only patches): cars, phones, consoles,
 * controllers, shoes, bikes, tools, furniture, LEGO, cards, sealed products.
 */
import { describe, it, expect } from "vitest";
import {
  adaptVisionObservationToListing,
} from "./awhina-vision-adapter";
import {
  parseVisionObservation,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";
import {
  composeCanonicalVisualIdentity,
  mergeCanonicalVisualIdentity,
  conversationPolicyFromIdentity,
} from "./awhina-canonical-visual-identity";
import { enrichObservationWithKnowledge } from "./awhina-vision-knowledge";
import {
  isFieldRelevant,
  resolveCanonicalListingObject,
} from "./awhina-domain-facts";
import { applyAwhinaDomainKnowledge, getAwhinaDomainRule } from "./awhina-domain-knowledge";
import { nextListingSlotQuestion } from "./awhina-pending-slots";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";

function field(
  value: string,
  confidence: "HIGH" | "MEDIUM" | "LOW" = "HIGH",
  evidence: VisionObservedField["evidence"] = "READABLE"
): VisionObservedField {
  return { value, confidence, evidence, note: "" };
}

function obs(partial: Partial<VisionListingObservation>): VisionListingObservation {
  const base = parseVisionObservation({});
  return {
    ...base,
    ...partial,
    listingType: partial.listingType || field("physical", "HIGH", "VISIBLE"),
    overallConfidence: partial.overallConfidence || "HIGH",
  };
}

type Case = {
  name: string;
  observation: VisionListingObservation;
  expect: {
    objectType: string;
    category: string;
    identity: RegExp;
    brand?: RegExp;
    modelOrFamily?: RegExp;
    /** Domain-knowledge forbidden attribute keys (camelCase). */
    forbiddenAttrs?: string[];
    /** Extras prefixes that must not appear. */
    rejectExtraPrefixes?: string[];
    /** ListingMissingSlot that must not be asked. */
    nextSlotNot?: string;
    /** isFieldRelevant slot that must be false. */
    irrelevantSlots?: string[];
  };
};

const MATRIX: Case[] = [
  {
    name: "BMW car",
    observation: obs({
      domain: "vehicles",
      listingType: field("vehicle", "HIGH"),
      objectType: field("vehicle", "HIGH", "VISIBLE"),
      displayIdentity: "BMW E92 335i Coupe",
      itemIdentity: field("BMW E92 335i Coupe", "HIGH"),
      brand: field("BMW", "HIGH"),
      product: field("3 Series", "HIGH"),
      model: field("335i", "MEDIUM"),
      variant: field("E92 Coupe", "HIGH"),
      category: field("Cars", "HIGH", "VISIBLE"),
      visibleText: ["BMW", "335i"],
      unknowns: ["exact year"],
      overallConfidence: "HIGH",
    }),
    expect: {
      objectType: "vehicle",
      category: "Cars",
      identity: /BMW.*E92|335i|3 Series/i,
      brand: /BMW/i,
      modelOrFamily: /335i|3 Series|E92/i,
      forbiddenAttrs: ["grade", "parallelColor"],
      irrelevantSlots: ["storage"],
      nextSlotNot: "storage",
    },
  },
  {
    name: "Toyota car",
    observation: obs({
      domain: "vehicles",
      listingType: field("vehicle", "HIGH"),
      objectType: field("vehicle", "HIGH", "VISIBLE"),
      displayIdentity: "Toyota Corolla",
      itemIdentity: field("Toyota Corolla", "HIGH"),
      brand: field("Toyota", "HIGH"),
      model: field("Corolla", "HIGH"),
      category: field("Cars", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "vehicle",
      category: "Cars",
      identity: /Toyota Corolla/i,
      brand: /Toyota/i,
      forbiddenAttrs: ["grade"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "iPhone",
    observation: obs({
      domain: "phones",
      objectType: field("phone", "HIGH", "VISIBLE"),
      displayIdentity: "Apple iPhone 15 Pro",
      itemIdentity: field("Apple iPhone 15 Pro", "HIGH"),
      brand: field("Apple", "HIGH"),
      product: field("iPhone 15 Pro", "HIGH"),
      model: field("iPhone 15 Pro", "HIGH"),
      category: field("Tech", "HIGH", "VISIBLE"),
      colour: field("natural titanium", "MEDIUM", "VISIBLE"),
    }),
    expect: {
      objectType: "phone",
      category: "Tech",
      identity: /iPhone 15 Pro/i,
      brand: /Apple/i,
      irrelevantSlots: ["odometer", "grade"],
    },
  },
  {
    name: "Android phone",
    observation: obs({
      domain: "phones",
      objectType: field("phone", "HIGH", "VISIBLE"),
      displayIdentity: "Samsung Galaxy S24",
      itemIdentity: field("Samsung Galaxy S24", "HIGH"),
      brand: field("Samsung", "HIGH"),
      model: field("Galaxy S24", "HIGH"),
      category: field("Tech", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "phone",
      category: "Tech",
      identity: /Galaxy S24/i,
      brand: /Samsung/i,
      irrelevantSlots: ["odometer", "grade"],
    },
  },
  {
    name: "PS5",
    observation: obs({
      domain: "gaming",
      objectType: field("console", "HIGH", "VISIBLE"),
      displayIdentity: "Sony PlayStation 5",
      itemIdentity: field("Sony PlayStation 5", "HIGH"),
      brand: field("Sony", "HIGH"),
      product: field("PlayStation 5", "HIGH"),
      model: field("PlayStation 5", "HIGH"),
      category: field("Gaming", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "console",
      category: "Gaming",
      identity: /PlayStation 5/i,
      forbiddenAttrs: ["storage", "batteryHealth"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "DualSense",
    observation: obs({
      domain: "gaming",
      objectType: field("controller", "HIGH", "VISIBLE"),
      displayIdentity: "Pink Sony DualSense wireless controller",
      itemIdentity: field("Pink Sony DualSense wireless controller", "HIGH"),
      brand: field("Sony", "HIGH"),
      product: field("DualSense", "HIGH"),
      model: field("DualSense", "HIGH"),
      colour: field("pink", "HIGH", "VISIBLE"),
      category: field("Gaming", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "controller",
      category: "Gaming",
      identity: /DualSense/i,
      forbiddenAttrs: ["storage", "batteryHealth"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "Razer mouse",
    observation: obs({
      domain: "electronics",
      objectType: field("gaming_mouse", "HIGH", "VISIBLE"),
      displayIdentity: "Razer DeathAdder V3",
      itemIdentity: field("Razer DeathAdder V3", "HIGH"),
      brand: field("Razer", "HIGH"),
      model: field("DeathAdder V3", "HIGH"),
      category: field("Gaming", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "gaming_mouse",
      category: "Gaming",
      identity: /Razer|DeathAdder/i,
      forbiddenAttrs: ["storage", "batteryHealth"],
      irrelevantSlots: ["storage"],
      nextSlotNot: "storage",
    },
  },
  {
    name: "laptop",
    observation: obs({
      domain: "electronics",
      objectType: field("boxed_hardware", "HIGH", "VISIBLE"),
      displayIdentity: "Apple MacBook Pro",
      itemIdentity: field("Apple MacBook Pro", "HIGH"),
      brand: field("Apple", "HIGH"),
      model: field("MacBook Pro", "HIGH"),
      category: field("Tech", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "boxed_hardware",
      category: "Tech",
      identity: /MacBook Pro/i,
      forbiddenAttrs: ["storage"],
      irrelevantSlots: ["odometer"],
    },
  },
  {
    name: "Nike shoe",
    observation: obs({
      domain: "fashion",
      objectType: field("shoes", "HIGH", "VISIBLE"),
      displayIdentity: "Nike Air Max 90",
      itemIdentity: field("Nike Air Max 90", "HIGH"),
      brand: field("Nike", "HIGH"),
      model: field("Air Max 90", "HIGH"),
      category: field("Fashion", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "shoes",
      category: "Fashion",
      identity: /Nike Air Max/i,
      forbiddenAttrs: ["storage"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "jacket",
    observation: obs({
      domain: "fashion",
      objectType: field("clothing", "HIGH", "VISIBLE"),
      displayIdentity: "North Face puffer jacket",
      itemIdentity: field("North Face puffer jacket", "HIGH"),
      brand: field("The North Face", "HIGH"),
      category: field("Fashion", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "clothing",
      category: "Fashion",
      identity: /North Face/i,
      forbiddenAttrs: ["storage"],
      irrelevantSlots: ["storage", "odometer"],
    },
  },
  {
    name: "mountain bike",
    observation: obs({
      domain: "bikes",
      objectType: field("mountain_bike", "HIGH", "VISIBLE"),
      displayIdentity: "Giant Talon mountain bike",
      itemIdentity: field("Giant Talon mountain bike", "HIGH"),
      brand: field("Giant", "HIGH"),
      model: field("Talon", "HIGH"),
      category: field("Sports", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "mountain_bike",
      category: "Sports",
      identity: /Giant Talon/i,
      forbiddenAttrs: ["storage", "mileage"],
      irrelevantSlots: ["storage", "odometer"],
    },
  },
  {
    name: "drill",
    observation: obs({
      domain: "tools",
      objectType: field("power_tool", "HIGH", "VISIBLE"),
      displayIdentity: "Makita 18V cordless drill",
      itemIdentity: field("Makita 18V cordless drill", "HIGH"),
      brand: field("Makita", "HIGH"),
      model: field("18V cordless drill", "HIGH"),
      category: field("Home", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "power_tool",
      category: "Home",
      identity: /Makita/i,
      forbiddenAttrs: ["storage", "mileage"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "chair",
    observation: obs({
      domain: "furniture",
      objectType: field("furniture", "HIGH", "VISIBLE"),
      displayIdentity: "Oak dining chair",
      itemIdentity: field("Oak dining chair", "HIGH"),
      category: field("Home", "HIGH", "VISIBLE"),
      visibleFeatures: ["wood", "dining chair"],
    }),
    expect: {
      objectType: "furniture",
      category: "Home",
      identity: /dining chair|Oak/i,
      forbiddenAttrs: ["storage", "mileage"],
      irrelevantSlots: ["storage", "odometer"],
    },
  },
  {
    name: "LEGO set",
    observation: obs({
      domain: "collectibles",
      objectType: field("lego_sealed_set", "HIGH", "VISIBLE"),
      displayIdentity: "LEGO Star Wars Millennium Falcon",
      itemIdentity: field("LEGO Star Wars Millennium Falcon", "HIGH"),
      brand: field("LEGO", "HIGH"),
      product: field("Star Wars Millennium Falcon", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "lego_sealed_set",
      category: "Collectibles",
      identity: /LEGO/i,
      forbiddenAttrs: ["grade", "parallelColor"],
    },
  },
  {
    name: "toy/model car",
    observation: obs({
      domain: "collectibles",
      objectType: field("toy_vehicle", "HIGH", "VISIBLE"),
      displayIdentity: "Hot Wheels BMW M3 diecast",
      itemIdentity: field("Hot Wheels BMW M3 diecast", "HIGH"),
      brand: field("Hot Wheels", "HIGH"),
      model: field("BMW M3", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "toy_vehicle",
      category: "Collectibles",
      identity: /Hot Wheels|BMW M3/i,
      irrelevantSlots: ["odometer", "transmission"],
    },
  },
  {
    name: "individual Topps card",
    observation: obs({
      domain: "trading-cards",
      objectType: field("individual_card", "HIGH", "VISIBLE"),
      displayIdentity: "Nicolò Barella Topps Chrome",
      itemIdentity: field("Nicolò Barella Topps Chrome", "HIGH"),
      brand: field("Topps", "HIGH"),
      cardSubject: field("Nicolò Barella", "HIGH"),
      cardSet: field("Topps Chrome", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "individual_card",
      category: "Collectibles",
      identity: /Barella|Topps Chrome/i,
      forbiddenAttrs: ["packsPerBox"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "PSA graded card",
    observation: obs({
      domain: "trading-cards",
      objectType: field("graded_card", "HIGH", "VISIBLE"),
      displayIdentity: "Dark Magician PSA 10",
      itemIdentity: field("Dark Magician PSA 10", "HIGH"),
      brand: field("Konami", "MEDIUM"),
      cardSubject: field("Dark Magician", "HIGH"),
      grader: field("PSA", "HIGH"),
      grade: field("10", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "graded_card",
      category: "Collectibles",
      identity: /Dark Magician|PSA/i,
      forbiddenAttrs: ["packsPerBox"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "Yu-Gi-Oh card set",
    observation: obs({
      domain: "trading-cards",
      objectType: field("card_bundle", "HIGH", "VISIBLE"),
      displayIdentity: "Yu-Gi-Oh Egyptian God Cards set",
      itemIdentity: field("Yu-Gi-Oh Egyptian God Cards set", "HIGH"),
      brand: field("Konami", "HIGH"),
      cardSubject: field(
        "The Winged Dragon of Ra, Slifer the Sky Dragon, and Obelisk the Tormentor",
        "HIGH"
      ),
      quantity: field("3", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "card_bundle",
      category: "Collectibles",
      identity: /Yu-Gi-Oh|Egyptian God/i,
      forbiddenAttrs: ["packsPerBox"],
      irrelevantSlots: ["storage"],
    },
  },
  {
    name: "Topps booster box",
    observation: obs({
      domain: "trading-cards",
      objectType: field("booster_box", "HIGH", "VISIBLE"),
      displayIdentity: "Topps Premier League booster box",
      itemIdentity: field("Topps Premier League booster box", "HIGH"),
      brand: field("Topps", "HIGH"),
      cardSet: field("Topps Premier League", "HIGH"),
      league: field("Premier League", "HIGH"),
      productFormat: field("booster box", "HIGH"),
      visibleText: ["Topps", "Premier League", "Booster Box"],
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "booster_box",
      category: "Collectibles",
      identity: /Topps Premier League booster box/i,
      forbiddenAttrs: ["parallel", "parallelColor", "serialNumber", "grade", "subject", "player"],
      rejectExtraPrefixes: ["subject:", "parallel:", "serial:", "grade:"],
      nextSlotNot: "card_subject",
    },
  },
  {
    name: "Riftbound booster display",
    observation: obs({
      domain: "trading-cards",
      objectType: field("booster_display", "HIGH", "VISIBLE"),
      displayIdentity: "Riftbound League of Legends Unleashed booster display",
      itemIdentity: field(
        "Riftbound League of Legends Unleashed booster display",
        "HIGH"
      ),
      brand: field("Riftbound", "HIGH"),
      cardSet: field("Riftbound Unleashed", "HIGH"),
      league: field("League of Legends", "HIGH"),
      productFormat: field("booster display", "HIGH"),
      visibleText: ["Riftbound", "Unleashed", "League of Legends"],
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "booster_display",
      category: "Collectibles",
      identity: /Riftbound.*Unleashed.*booster display/i,
      forbiddenAttrs: ["parallel", "parallelColor", "serialNumber", "grade", "subject", "player"],
      rejectExtraPrefixes: ["subject:", "parallel:", "serial:", "grade:"],
      nextSlotNot: "card_subject",
    },
  },
  {
    name: "Pokémon ETB",
    observation: obs({
      domain: "trading-cards",
      objectType: field("etb", "HIGH", "VISIBLE"),
      displayIdentity: "Pokémon Scarlet & Violet Elite Trainer Box",
      itemIdentity: field("Pokémon Scarlet & Violet Elite Trainer Box", "HIGH"),
      brand: field("Pokémon", "HIGH"),
      productFormat: field("etb", "HIGH"),
      category: field("Collectibles", "HIGH", "VISIBLE"),
    }),
    expect: {
      objectType: "etb",
      category: "Collectibles",
      identity: /Elite Trainer|ETB|Pokémon/i,
      forbiddenAttrs: ["parallel", "parallelColor", "serialNumber", "subject", "player"],
      rejectExtraPrefixes: ["subject:", "parallel:", "serial:"],
    },
  },
];

describe("universal visual identifier — cross-domain matrix", () => {
  it.each(MATRIX)("$name keeps hierarchical identity and rejects nonsense facts", (c) => {
    const adapted = adaptVisionObservationToListing(c.observation);
    const identity = composeCanonicalVisualIdentity(c.observation);
    const canonical = resolveCanonicalListingObject(adapted.listingFill);
    const fill = applyAwhinaDomainKnowledge(adapted.listingFill);
    const description = String(
      finalizeAwhinaListingDescription(fill).description || ""
    );

    expect(adapted.canonicalIdentity.objectType, c.name).toBe(c.expect.objectType);
    expect(identity.objectType, c.name).toBe(c.expect.objectType);
    expect(canonical.objectType, c.name).toBe(c.expect.objectType);
    expect(adapted.listingFill.category, c.name).toBe(c.expect.category);
    expect(adapted.displayIdentity, c.name).toMatch(c.expect.identity);
    expect(adapted.listingFill.title || "", c.name).toMatch(c.expect.identity);
    expect(adapted.canonicalIdentity.displayName, c.name).toMatch(c.expect.identity);

    // Never collapse to bare domain nouns when richer identity exists
    expect(adapted.displayIdentity.toLowerCase(), c.name).not.toBe("car");
    expect(adapted.displayIdentity.toLowerCase(), c.name).not.toBe("trading card");
    expect(adapted.displayIdentity.toLowerCase(), c.name).not.toBe("vehicle");
    expect(adapted.displayIdentity.toLowerCase(), c.name).not.toBe("phone");

    if (c.expect.brand) {
      expect(adapted.canonicalIdentity.brand || "", c.name).toMatch(c.expect.brand);
    }
    if (c.expect.modelOrFamily) {
      const family = [
        adapted.canonicalIdentity.model,
        adapted.canonicalIdentity.productFamily,
        adapted.canonicalIdentity.generation,
        adapted.canonicalIdentity.variant,
      ]
        .filter(Boolean)
        .join(" ");
      expect(family, c.name).toMatch(c.expect.modelOrFamily);
    }

    const rule = getAwhinaDomainRule(c.expect.objectType as any);
    for (const attr of c.expect.forbiddenAttrs || []) {
      expect(rule?.forbiddenAttributes || [], `${c.name} forbids ${attr}`).toEqual(
        expect.arrayContaining([attr])
      );
    }
    const extrasJoined = (fill.extras || []).join(" | ");
    for (const prefix of c.expect.rejectExtraPrefixes || []) {
      expect(extrasJoined.toLowerCase(), `${c.name} extras`).not.toContain(
        prefix.toLowerCase()
      );
    }
    for (const slot of c.expect.irrelevantSlots || []) {
      expect(isFieldRelevant(slot as any, fill), `${c.name} irrelevant ${slot}`).toBe(
        false
      );
    }
    if (c.expect.nextSlotNot) {
      expect(nextListingSlotQuestion(fill)?.slot, c.name).not.toBe(c.expect.nextSlotNot);
    }
    expect(description, c.name).not.toMatch(/Attr:/i);

    // Structured extras retain objectType — not only a flattened title string
    expect(fill.extras?.some((e) => e === `objectType:${c.expect.objectType}`), c.name).toBe(
      true
    );
  });
});

describe("canonical identity confidence + merge", () => {
  it("preserves BMW E92 when 335i is only MEDIUM", () => {
    const identity = composeCanonicalVisualIdentity(
      obs({
        domain: "vehicles",
        objectType: field("vehicle", "HIGH", "VISIBLE"),
        displayIdentity: "BMW E92 Coupe",
        brand: field("BMW", "HIGH"),
        product: field("3 Series", "HIGH"),
        model: field("335i", "MEDIUM"),
        variant: field("E92 Coupe", "HIGH"),
        overallConfidence: "MEDIUM",
        unknowns: ["exact model trim"],
      })
    );
    expect(identity.displayName).toMatch(/BMW.*E92/i);
    expect(identity.displayName.toLowerCase()).not.toBe("car");
    expect(identity.uncertainImportant.length).toBeGreaterThan(0);
    const policy = conversationPolicyFromIdentity(identity);
    expect(policy.mode).not.toBe("ask_targeted");
    expect(policy.prompt || "").not.toMatch(/What would you like me to do/i);
  });

  it("second photo can deepen BMW E92 → 335i without collapsing", () => {
    const first = composeCanonicalVisualIdentity(
      obs({
        domain: "vehicles",
        objectType: field("vehicle", "HIGH", "VISIBLE"),
        displayIdentity: "BMW E92 Coupe",
        brand: field("BMW", "HIGH"),
        product: field("3 Series", "HIGH"),
        variant: field("E92 Coupe", "HIGH"),
      })
    );
    const second = composeCanonicalVisualIdentity(
      obs({
        domain: "vehicles",
        objectType: field("vehicle", "HIGH", "VISIBLE"),
        displayIdentity: "BMW 335i E92 Coupe",
        brand: field("BMW", "HIGH"),
        model: field("335i", "HIGH", "READABLE"),
        variant: field("E92 Coupe", "HIGH"),
        visibleText: ["335i"],
      })
    );
    const merged = mergeCanonicalVisualIdentity(first, second);
    expect(merged.displayName).toMatch(/335i/i);
    expect(merged.displayName).toMatch(/E92/i);
    expect(merged.displayName.toLowerCase()).not.toBe("vehicle");
  });

  it("knowledge pack fills gaps but never overwrites HIGH vision identity", () => {
    const raw = obs({
      domain: "trading-cards",
      objectType: field("booster_display", "HIGH", "VISIBLE"),
      displayIdentity: "Riftbound League of Legends Unleashed booster display",
      itemIdentity: field(
        "Riftbound League of Legends Unleashed booster display",
        "HIGH"
      ),
      brand: field("Riftbound", "HIGH"),
      productFormat: field("booster display", "HIGH"),
      overallConfidence: "HIGH",
    });
    const { observation } = enrichObservationWithKnowledge(raw);
    expect(observation.displayIdentity).toMatch(/Riftbound.*Unleashed.*booster display/i);
    expect(observation.displayIdentity.toLowerCase()).not.toBe("trading card");
    expect(observation.itemIdentity.value).toMatch(/Riftbound/i);
    expect(observation.itemIdentity.confidence).toBe("HIGH");
    expect(observation.brand.value).toBe("Riftbound");
    expect(observation.brand.confidence).toBe("HIGH");
  });
});

describe("before/after identity ownership", () => {
  it("Riftbound: never reduces to trading card", () => {
    const adapted = adaptVisionObservationToListing(
      MATRIX.find((c) => c.name === "Riftbound booster display")!.observation
    );
    expect(adapted.displayIdentity).toMatch(/Riftbound/i);
    expect(adapted.displayIdentity).toMatch(/booster display/i);
    expect(adapted.displayIdentity.toLowerCase()).not.toMatch(/^trading card$/);
    expect(adapted.canonicalIdentity.objectType).toBe("booster_display");
  });

  it("car: never reduces to vehicle/car noun", () => {
    const adapted = adaptVisionObservationToListing(
      MATRIX.find((c) => c.name === "BMW car")!.observation
    );
    expect(adapted.displayIdentity).toMatch(/BMW/i);
    expect(adapted.displayIdentity.toLowerCase()).not.toBe("car");
    expect(adapted.displayIdentity.toLowerCase()).not.toBe("vehicle");
  });

  it("phone: never reduces to phone noun", () => {
    const adapted = adaptVisionObservationToListing(
      MATRIX.find((c) => c.name === "iPhone")!.observation
    );
    expect(adapted.displayIdentity).toMatch(/iPhone 15 Pro/i);
    expect(adapted.displayIdentity.toLowerCase()).not.toBe("phone");
  });

  it("electronics: DualSense stays DualSense, not game controller", () => {
    const adapted = adaptVisionObservationToListing(
      MATRIX.find((c) => c.name === "DualSense")!.observation
    );
    expect(adapted.displayIdentity).toMatch(/DualSense/i);
    expect(adapted.displayIdentity.toLowerCase()).not.toBe("game controller");
    expect(adapted.canonicalIdentity.objectType).toBe("controller");
  });
});
