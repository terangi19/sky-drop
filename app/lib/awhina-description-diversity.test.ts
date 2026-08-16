import { describe, expect, it } from "vitest";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import {
  buildDescriptionWriterFacts,
  validateAiListingDescription,
} from "./awhina-description-writer";
import { finalizeAwhinaListingDescription } from "./awhina-listing-composer";

const FIXTURES: Array<{
  name: string;
  fill: SkyAiListingFill;
  expectedFacts: Record<string, unknown>;
  unique: RegExp;
}> = [
  {
    name: "Yu-Gi-Oh three-card bundle",
    fill: {
      title:
        "The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor Yu-Gi-Oh!",
      listingType: "physical",
      condition: "Used - Good",
      extras: [
        "objectType:card_bundle",
        "set:Egyptian God Cards",
        "subject:The Winged Dragon of Ra, Slifer the Sky Dragon, Obelisk the Tormentor",
        "bundle_quantity:3",
      ],
    },
    expectedFacts: { objectType: "card_bundle", quantity: 3, collection: "Egyptian God Cards" },
    unique: /bundle includes/i,
  },
  {
    name: "Riftbound booster box",
    fill: {
      title: "Riftbound League of Legends Unleashed booster box",
      listingType: "physical",
      condition: "New",
      extras: [
        "objectType:booster_box",
        "brand:Riftbound",
        "franchise:League of Legends",
        "set:Riftbound Unleashed",
        "productFormat:booster box",
      ],
    },
    expectedFacts: { objectType: "booster_box", sealed: true },
    unique: /sealed TCG product containing booster packs/i,
  },
  {
    name: "Topps numbered card",
    fill: {
      title: "Nicolò Barella Topps Chrome",
      listingType: "physical",
      condition: "Used - Good",
      extras: [
        "objectType:individual_card",
        "subject:Nicolò Barella",
        "set:Topps Chrome",
        "serial:14/25",
      ],
    },
    expectedFacts: { objectType: "individual_card", collection: "Topps Chrome" },
    unique: /Barella|14\/25/i,
  },
  {
    name: "DualSense",
    fill: {
      title: "Sony DualSense wireless controller",
      listingType: "physical",
      condition: "Used - Good",
      extras: ["objectType:controller", "brand:Sony", "Comes with charging cable"],
    },
    expectedFacts: { objectType: "controller" },
    unique: /charging cable/i,
  },
  {
    name: "iPhone",
    fill: {
      title: "Apple iPhone 15 Pro",
      listingType: "physical",
      condition: "Used - Good",
      extras: ["objectType:phone", "brand:Apple", "model:iPhone 15 Pro", "storage:256GB"],
    },
    expectedFacts: { objectType: "phone" },
    unique: /iPhone/i,
  },
  {
    name: "mountain bike",
    fill: {
      title: "Giant Talon mountain bike",
      listingType: "physical",
      condition: "Used - Good",
      extras: ["objectType:mountain_bike", "brand:Giant", "model:Talon", "Hydraulic disc brakes"],
    },
    expectedFacts: { objectType: "mountain_bike" },
    unique: /Hydraulic disc brakes/i,
  },
  {
    name: "Nissan Skyline R34",
    fill: {
      title: "Nissan Skyline R34",
      listingType: "vehicle",
      vehicleMake: "Nissan",
      vehicleModel: "Skyline",
      vehicleGeneration: "R34",
      extras: ["objectType:vehicle"],
    },
    expectedFacts: { objectType: "vehicle", vehicle: { make: "Nissan", model: "Skyline", generation: "R34" } },
    unique: /Nissan Skyline R34/i,
  },
  {
    name: "BMW 335i",
    fill: {
      title: "BMW 335i",
      listingType: "vehicle",
      condition: "Used - Good",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      vehicleGeneration: "E92",
      vehicleYear: "2007",
      vehicleOdometer: "142000",
      vehicleTransmission: "Automatic",
      extras: ["objectType:vehicle"],
    },
    expectedFacts: { objectType: "vehicle", vehicle: { year: "2007", make: "BMW", model: "335i" } },
    unique: /142,?000|automatic/i,
  },
  {
    name: "Nike shoes",
    fill: {
      title: "Nike Air Max 90",
      listingType: "physical",
      condition: "Used - Good",
      extras: ["objectType:shoes", "brand:Nike", "model:Air Max 90", "size:US 10"],
    },
    expectedFacts: { objectType: "shoes" },
    unique: /Nike Air Max 90/i,
  },
  {
    name: "LEGO set",
    fill: {
      title: "LEGO Star Wars Millennium Falcon",
      listingType: "physical",
      condition: "New",
      extras: ["objectType:lego_sealed_set", "brand:LEGO", "set:Star Wars Millennium Falcon"],
    },
    expectedFacts: { objectType: "lego_sealed_set", collection: "Star Wars Millennium Falcon" },
    unique: /LEGO|Millennium Falcon/i,
  },
];

const GENERIC_PROMOTION_RE =
  /\b(?:standout|known for (?:its )?performance and design|perfect for|ideal for|must-have|great addition|exciting|iconic|don't miss out)\b/i;

function skeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(?:nissan|skyline|r34|bmw|iphone|apple|sony|dualsense|giant|talon|nike|air|max|lego|star|wars|millennium|falcon|riftbound|league|legends|unleashed|topps|chrome|barella|yu-gi-oh|egyptian|god|cards?|winged|dragon|ra|slifer|obelisk)\b/g, "ENTITY")
    .replace(/\b\d[\d,./]*\b/g, "NUMBER")
    .replace(/\s+/g, " ")
    .trim();
}

describe("general grounded description writer — diversity regressions", () => {
  it.each(FIXTURES)("$name passes its structured facts to the writer", ({ fill, expectedFacts }) => {
    const facts = buildDescriptionWriterFacts(fill);
    expect(facts).toMatchObject(expectedFacts);
    expect(JSON.stringify(facts)).not.toMatch(/location|price/i);
  });

  it.each(FIXTURES)("$name produces factual domain-specific fallback copy", ({ name, fill, unique }) => {
    const description = String(finalizeAwhinaListingDescription(fill).description || "");
    expect(description, name).toMatch(unique);
    expect(description, name).not.toMatch(GENERIC_PROMOTION_RE);
    expect(description, name).not.toMatch(/don'?t miss|perfect for|great addition/i);
    // The local offline fallback may be terser than the async writer, but it
    // must never be a generic promotion or another domain's sentence shape.
  });

  it("does not reuse bundle or sealed-product skeletons across unrelated domains", () => {
    const descriptions = new Map(
      FIXTURES.map((fixture) => [
        fixture.name,
        String(finalizeAwhinaListingDescription(fixture.fill).description || ""),
      ])
    );
    for (const [name, description] of descriptions) {
      if (name !== "Yu-Gi-Oh three-card bundle") {
        expect(description, name).not.toMatch(/bundle includes|sold together as a set|featuring/i);
      }
      if (name !== "Riftbound booster box") {
        expect(description, name).not.toMatch(/sealed TCG product containing booster packs/i);
      }
    }
    const unrelated = [
      "DualSense",
      "iPhone",
      "mountain bike",
      "Nissan Skyline R34",
      "Nike shoes",
      "LEGO set",
    ].map((name) => skeleton(descriptions.get(name) || ""));
    expect(new Set(unrelated).size).toBe(unrelated.length);
  });

  it("rejects generic vehicle praise even when identity facts are complete", () => {
    const skyline = FIXTURES.find((fixture) => fixture.name === "Nissan Skyline R34")!;
    expect(
      validateAiListingDescription(
        "This Nissan Skyline is a standout vehicle known for its performance and design.",
        buildDescriptionWriterFacts(skyline.fill)
      )
    ).toBeNull();
  });
});
