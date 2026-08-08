/**
 * Electronics domain — phones, consoles, laptops, audio.
 * Storage/variant from user text only; never invents prices or specs.
 */

import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
} from "../types";

type ProductHit = {
  pattern: RegExp;
  brand: string;
  family: string;
  model: string;
  category: "Tech" | "Gaming";
  listingType?: "physical";
};

const PRODUCTS: ReadonlyArray<ProductHit> = [
  { pattern: /\biphone\s*15\s*pro\s*max\b/i, brand: "Apple", family: "iPhone", model: "iPhone 15 Pro Max", category: "Tech" },
  { pattern: /\biphone\s*15\s*pro\b/i, brand: "Apple", family: "iPhone", model: "iPhone 15 Pro", category: "Tech" },
  { pattern: /\biphone\s*15\b/i, brand: "Apple", family: "iPhone", model: "iPhone 15", category: "Tech" },
  { pattern: /\biphone\s*14\s*pro\b/i, brand: "Apple", family: "iPhone", model: "iPhone 14 Pro", category: "Tech" },
  { pattern: /\biphone\s*14\b/i, brand: "Apple", family: "iPhone", model: "iPhone 14", category: "Tech" },
  { pattern: /\biphone\s*13\b/i, brand: "Apple", family: "iPhone", model: "iPhone 13", category: "Tech" },
  { pattern: /\biphone\b/i, brand: "Apple", family: "iPhone", model: "iPhone", category: "Tech" },
  { pattern: /\bipad\s*pro\b/i, brand: "Apple", family: "iPad", model: "iPad Pro", category: "Tech" },
  { pattern: /\bipad\b/i, brand: "Apple", family: "iPad", model: "iPad", category: "Tech" },
  { pattern: /\bmacbook\s*pro\b/i, brand: "Apple", family: "MacBook", model: "MacBook Pro", category: "Tech" },
  { pattern: /\bmacbook\s*air\b/i, brand: "Apple", family: "MacBook", model: "MacBook Air", category: "Tech" },
  { pattern: /\bmacbook\b/i, brand: "Apple", family: "MacBook", model: "MacBook", category: "Tech" },
  { pattern: /\bairpods\s*pro\b/i, brand: "Apple", family: "AirPods", model: "AirPods Pro", category: "Tech" },
  { pattern: /\bairpods\b/i, brand: "Apple", family: "AirPods", model: "AirPods", category: "Tech" },
  { pattern: /\bgalaxy\s*s24\b|\bs24\s*ultra\b/i, brand: "Samsung", family: "Galaxy", model: "Galaxy S24", category: "Tech" },
  { pattern: /\bsamsung\s*(?:galaxy\s*)?s23\b/i, brand: "Samsung", family: "Galaxy", model: "Galaxy S23", category: "Tech" },
  { pattern: /\bpixel\s*8\s*pro\b/i, brand: "Google", family: "Pixel", model: "Pixel 8 Pro", category: "Tech" },
  { pattern: /\bpixel\s*8\b/i, brand: "Google", family: "Pixel", model: "Pixel 8", category: "Tech" },
  { pattern: /\bps5\b|\bplaystation\s*5\b/i, brand: "Sony", family: "PlayStation", model: "PS5", category: "Gaming" },
  { pattern: /\bps4\b|\bplaystation\s*4\b/i, brand: "Sony", family: "PlayStation", model: "PS4", category: "Gaming" },
  { pattern: /\bxbox\s*series\s*x\b/i, brand: "Microsoft", family: "Xbox", model: "Xbox Series X", category: "Gaming" },
  { pattern: /\bxbox\s*series\s*s\b/i, brand: "Microsoft", family: "Xbox", model: "Xbox Series S", category: "Gaming" },
  { pattern: /\bnintendo\s*switch\s*oled\b/i, brand: "Nintendo", family: "Switch", model: "Switch OLED", category: "Gaming" },
  { pattern: /\bnintendo\s*switch\b|\bswitch\s*console\b/i, brand: "Nintendo", family: "Switch", model: "Nintendo Switch", category: "Gaming" },
  { pattern: /\bsamsung\s*tv\b|\b\d{2}\s*"?\s*(?:samsung\s*)?tv\b/i, brand: "Samsung", family: "TV", model: "Samsung TV", category: "Tech" },
];

const ELECTRONICS_DETECT =
  /\b(iphone|ipad|macbook|airpods|ps5|ps4|playstation|xbox|switch|pixel|samsung\s*galaxy|laptop|phone|console|tablet|tv)\b/i;

function parseStorage(text: string): Attribute | undefined {
  const m = text.match(/\b(\d+)\s*(gb|tb)\b/i);
  if (!m) return undefined;
  return {
    key: "storage",
    value: `${m[1]}${m[2].toUpperCase()}`,
    unit: { id: m[2].toLowerCase(), label: m[2].toUpperCase(), kind: "storage" },
    provenance: "USER",
  };
}

function parseColour(text: string): Attribute | undefined {
  const m = text.match(
    /\b(black|white|blue|red|green|gold|silver|purple|pink|midnight|starlight|natural\s*titanium|blue\s*titanium)\b/i
  );
  if (!m) return undefined;
  return { key: "colour", value: m[1], provenance: "USER" };
}

function resolve(input: DomainResolveInput): DomainResolveResult {
  const text = String(input.text || "").trim();
  if (!text) return { hit: false, score: 0 };

  let hit: ProductHit | undefined;
  for (const p of PRODUCTS) {
    if (p.pattern.test(text)) {
      hit = p;
      break;
    }
  }
  if (!hit && !ELECTRONICS_DETECT.test(text)) {
    return { hit: false, score: 0 };
  }
  if (!hit) {
    // Generic electronics mention — low confidence, ask clarify
    const entity: MarketplaceEntity = {
      domain: "electronics",
      category: {
        id: "tech",
        label: "Tech",
        skyDropCategory: "Tech",
        listingTypeHint: "physical",
      },
      attributes: [parseStorage(text), parseColour(text)].filter(Boolean) as Attribute[],
      displayName: text.slice(0, 80),
      confidence: "low",
      provenance: "MODEL_INFERENCE",
      userFacts: [],
      unknowns: ["model"],
      needsCurrentCheck: ["current specs", "market value"],
    };
    return {
      hit: true,
      entity,
      score: 0.35,
      clarify: [
        {
          field: "model",
          question: "Which device exactly — e.g. iPhone 15 Pro 128GB, PS5?",
          priority: 1,
        },
      ],
    };
  }

  const attributes: Attribute[] = [];
  const storage = parseStorage(text);
  const colour = parseColour(text);
  if (storage) attributes.push(storage);
  if (colour) attributes.push(colour);

  const unknowns: string[] = [];
  if (!storage && /iphone|ipad|macbook|pixel|galaxy|phone|laptop/i.test(hit.model)) {
    unknowns.push("storage");
  }

  const displayName = [hit.model, storage?.value, colour?.value].filter(Boolean).join(" ");

  const entity: MarketplaceEntity = {
    domain: hit.category === "Gaming" ? "gaming" : "electronics",
    brand: { id: hit.brand.toLowerCase(), name: hit.brand },
    family: {
      id: hit.family.toLowerCase(),
      name: hit.family,
      brandId: hit.brand.toLowerCase(),
    },
    model: {
      id: hit.model.toLowerCase().replace(/\s+/g, "-"),
      name: hit.model,
      brandId: hit.brand.toLowerCase(),
    },
    category: {
      id: hit.category.toLowerCase(),
      label: hit.category,
      skyDropCategory: hit.category,
      listingTypeHint: "physical",
    },
    attributes,
    displayName,
    confidence: storage || !unknowns.includes("storage") ? "high" : "medium",
    provenance: "LOCAL_DATA",
    userFacts: [storage?.value, colour?.value].filter(Boolean) as string[],
    unknowns,
    needsCurrentCheck: ["market value", "current battery health norms"],
  };

  const clarify: DomainClarifyAsk[] = [];
  if (unknowns.includes("storage")) {
    clarify.push({
      field: "storage",
      question: `What storage size for the ${hit.model} — e.g. 128GB, 256GB?`,
      priority: 1,
    });
  }

  return {
    hit: true,
    entity,
    clarify,
    score: 0.85 + (storage ? 0.1 : 0),
  };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  const has = (k: string) => entity.attributes.some((a) => a.key === k);
  if (!entity.model || entity.model.name === "iPhone") {
    asks.push({ field: "model", question: "Exact model?", priority: 1 });
  }
  if (!has("storage") && entity.unknowns.includes("storage")) {
    asks.push({ field: "storage", question: "Storage size?", priority: 1 });
  }
  asks.push({ field: "condition", question: "Condition — New, Like New, Good?", priority: 2 });
  asks.push({ field: "price", question: "Asking price?", priority: 3 });
  asks.push({ field: "location", question: "Pickup area?", priority: 4 });
  return asks;
}

export const electronicsDomain: MarketplaceDomainModule = {
  id: "electronics",
  detect: (text) => (ELECTRONICS_DETECT.test(text) ? 0.8 : 0),
  resolve,
  enrichmentPriority,
};
