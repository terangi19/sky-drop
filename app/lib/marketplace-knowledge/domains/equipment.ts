/**
 * Equipment / tools / machinery — light first slice (e.g. digger rental).
 */

import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
} from "../types";

const EQUIPMENT_ALIASES: ReadonlyArray<{ pattern: RegExp; name: string; rental?: boolean }> = [
  { pattern: /\b(?:mini\s*)?digger\b|\bexcavator\b/i, name: "Digger", rental: true },
  { pattern: /\bbobcat\b|\bskid\s*steer\b/i, name: "Skid steer", rental: true },
  { pattern: /\btrailer\b/i, name: "Trailer", rental: true },
  { pattern: /\bgenerator\b/i, name: "Generator", rental: true },
  { pattern: /\bscaffolding\b/i, name: "Scaffolding", rental: true },
  { pattern: /\blawn\s*mower\b|\bmower\b/i, name: "Lawn mower" },
  { pattern: /\bchainsaw\b/i, name: "Chainsaw" },
  { pattern: /\bdrill\b|\bangle\s*grinder\b|\btool\s*set\b/i, name: "Power tools" },
];

const EQUIPMENT_DETECT =
  /\b(digger|excavator|bobcat|skid\s*steer|trailer|generator|scaffolding|lawn\s*mower|chainsaw|hire|rental\s*equipment)\b/i;

function resolve(input: DomainResolveInput): DomainResolveResult {
  const text = String(input.text || "").trim();
  if (!text || !EQUIPMENT_DETECT.test(text)) return { hit: false, score: 0 };

  let name = "";
  let rentalHint = /\b(rent|hire|rental|daily|per\s*day)\b/i.test(text);
  for (const row of EQUIPMENT_ALIASES) {
    if (row.pattern.test(text)) {
      name = row.name;
      if (row.rental) rentalHint = rentalHint || /\brent|hire|rental\b/i.test(text);
      break;
    }
  }

  const attributes: Attribute[] = [];
  const daily = text.match(/\$?\s*([\d,]+)\s*(?:\/|\s*per\s*)\s*day/i);
  if (daily) {
    attributes.push({ key: "dailyRate", value: daily[1].replace(/,/g, ""), provenance: "USER" });
  }

  const entity: MarketplaceEntity = {
    domain: "equipment",
    model: name ? { id: name.toLowerCase().replace(/\s+/g, "-"), name } : undefined,
    category: {
      id: rentalHint ? "equipment-rental" : "equipment",
      label: rentalHint ? "Equipment Rental" : "Equipment",
      skyDropCategory: "Other",
      listingTypeHint: rentalHint ? "rental" : "physical",
    },
    attributes,
    displayName: name || text.slice(0, 80),
    confidence: name ? "high" : "medium",
    provenance: "LOCAL_DATA",
    userFacts: daily ? [`$${daily[1]}/day`] : [],
    unknowns: daily ? [] : rentalHint ? ["dailyRate"] : [],
    needsCurrentCheck: ["market hire rates"],
  };

  const clarify: DomainClarifyAsk[] = [];
  if (rentalHint && !daily) {
    clarify.push({
      field: "dailyRate",
      question: `Daily hire rate for the ${name || "equipment"}?`,
      priority: 1,
    });
  }

  return { hit: true, entity, clarify, score: name ? 0.82 : 0.5 };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  if (entity.category?.listingTypeHint === "rental") {
    if (!entity.attributes.some((a) => a.key === "dailyRate")) {
      asks.push({ field: "dailyRate", question: "Daily rate?", priority: 1 });
    }
    asks.push({ field: "deposit", question: "Bond / deposit?", priority: 2 });
    asks.push({ field: "location", question: "Pickup location?", priority: 3 });
  } else {
    asks.push({ field: "condition", question: "Condition?", priority: 1 });
    asks.push({ field: "price", question: "Asking price?", priority: 2 });
  }
  return asks;
}

export const equipmentDomain: MarketplaceDomainModule = {
  id: "equipment",
  detect: (text) => (EQUIPMENT_DETECT.test(text) ? 0.7 : 0),
  resolve,
  enrichmentPriority,
};
