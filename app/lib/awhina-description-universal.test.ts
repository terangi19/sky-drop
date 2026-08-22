/**
 * Unknown-listing tests — categories NOT used as implementation templates.
 * Proves the fact-first composer generalises without product-specific regexes.
 */
import { describe, expect, it } from "vitest";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { enforcePublicListingDescription } from "./awhina-listing-composer";
import {
  GENERIC_MARKETPLACE_FILLER_RE,
  hasSemanticFactDuplication,
  validateDescriptionQualityContract,
} from "./awhina-description-quality";
import { MARKETING_FILLER_RE } from "./awhina-description-writer";

function describeListing(fill: SkyAiListingFill): string {
  return enforcePublicListingDescription(fill, { force: true }).description?.trim() || "";
}

function assertUniversalQuality(desc: string, fill: SkyAiListingFill, must: RegExp[]) {
  expect(desc.length, "non-empty").toBeGreaterThan(12);
  for (const re of must) expect(desc).toMatch(re);
  expect(desc).not.toMatch(MARKETING_FILLER_RE);
  expect(desc).not.toMatch(GENERIC_MARKETPLACE_FILLER_RE);
  expect(hasSemanticFactDuplication(desc)).toBe(false);
  expect(validateDescriptionQualityContract(desc, fill).ok).toBe(true);
}

describe("unknown listings — never seen in template code", () => {
  it("industrial metal lathe", () => {
    const fill: SkyAiListingFill = {
      title: "Colchester Triumph 2000 metal lathe",
      condition: "Used - Fair",
      location: "Whanganui",
      extras: ["note:3-phase power", "note:includes chuck and tooling"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/lathe/i, /Whanganui/i]);
    expect(desc).not.toMatch(/\bper hour\b/i);
  });

  it("beekeeping flow hive", () => {
    const fill: SkyAiListingFill = {
      title: "Flow Hive 2 cedar bee hive",
      condition: "Used - Good",
      location: "Nelson",
      extras: ["note:complete with frames", "note:used one season"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/hive|Flow/i, /Nelson/i]);
  });

  it("wanted E92 bumper — buyer voice", () => {
    const fill: SkyAiListingFill = {
      title: "BMW E92 M Sport rear bumper Space Grey",
      listingType: "wanted",
      location: "Auckland",
      price: "800",
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/looking for|wanted|after a/i, /E92|bumper/i, /Auckland/i]);
    expect(desc).not.toMatch(/\bfor sale\b/i);
    expect(desc).not.toMatch(/\bselling my\b/i);
  });

  it("rich lawn service — not product condition", () => {
    const fill: SkyAiListingFill = {
      title: "Lawn mowing",
      listingType: "service",
      category: "Gardening",
      location: "West Auckland",
      extras: [
        "note:small lawns from $40",
        "note:larger lawns quoted depending on size",
        "note:regular fortnightly mowing available",
        "note:green waste removal offered",
      ],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/lawn|mowing/i, /West Auckland|\$40|fortnightly|green waste/i]);
    expect(desc).not.toMatch(/\b(?:item|product)\s+in\s+good\s+condition\b/i);
    expect(desc).not.toMatch(/\bfor sale\b/i);
  });

  it("tandem trailer rental", () => {
    const fill: SkyAiListingFill = {
      title: "Tandem trailer",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Henderson",
      rentalPriceDaily: "60",
      rentalDeposit: "150",
      rentalSubType: "equipment",
      extras: ["note:pickup only", "includes:tie-down straps"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/trailer/i, /Henderson/i]);
    expect(desc).not.toMatch(/\bselling my\b/i);
    expect(desc).not.toMatch(/\bfor sale\b/i);
  });

  it("kombucha scoby culture kit", () => {
    const fill: SkyAiListingFill = {
      title: "Kombucha SCOBY starter kit",
      condition: "Used - Good",
      location: "New Plymouth",
      extras: ["note:includes jar and starter tea", "quantity:2 cultures"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/SCOBY|kombucha/i, /New Plymouth/i]);
  });

  it("mobile coffee cart hire", () => {
    const fill: SkyAiListingFill = {
      title: "Mobile coffee cart hire",
      listingType: "rental",
      category: "Equipment Hire",
      location: "Queenstown",
      rentalPriceDaily: "350",
      rentalSubType: "equipment",
      extras: ["note:includes barista for events", "note:minimum 4 hour hire"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/coffee|cart/i, /Queenstown/i]);
  });

  it("piano tuning service", () => {
    const fill: SkyAiListingFill = {
      title: "Piano tuning",
      listingType: "service",
      category: "Music & Instruments",
      location: "Christchurch",
      extras: ["note:$180 standard tune", "note:can travel within Canterbury"],
    };
    const desc = describeListing(fill);
    assertUniversalQuality(desc, fill, [/piano/i, /Christchurch|Canterbury|\$180/i]);
  });
});

describe("quality contract — domain invariants", () => {
  it("rejects service described as product condition", () => {
    const fill: SkyAiListingFill = { title: "Cleaning", listingType: "service" };
    const bad = "Cleaning item in good used condition. Located in Auckland.";
    expect(validateDescriptionQualityContract(bad, fill).ok).toBe(false);
  });

  it("rejects wanted sounding like sale", () => {
    const fill: SkyAiListingFill = { title: "E92 bumper", listingType: "wanted" };
    expect(validateDescriptionQualityContract("E92 bumper for sale in Auckland.", fill).ok).toBe(false);
  });

  it("rejects invented collectible hype", () => {
    const fill: SkyAiListingFill = {
      title: "Football sticker",
      category: "Collectibles",
      listingType: "physical",
    };
    const bad = "Rare highly sought-after iconic investment potential sticker.";
    expect(validateDescriptionQualityContract(bad, fill).ok).toBe(false);
  });
});
