/**
 * Fashion + sneakers / light gaming apparel domain.
 * Controlled aliases only — never invent authenticity or market value.
 */

import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
} from "../types";

type FashionHit = {
  pattern: RegExp;
  brand: string;
  model: string;
  category: "Fashion" | "Gaming";
  family?: string;
};

const PRODUCTS: ReadonlyArray<FashionHit> = [
  { pattern: /\baj\s*1\b|\bair\s*jordan\s*1\b|\bjordan\s*1\b/i, brand: "Nike", model: "Air Jordan 1", family: "Jordan", category: "Fashion" },
  { pattern: /\baj\s*4\b|\bair\s*jordan\s*4\b|\bjordan\s*4\b/i, brand: "Nike", model: "Air Jordan 4", family: "Jordan", category: "Fashion" },
  { pattern: /\baj\s*11\b|\bair\s*jordan\s*11\b|\bjordan\s*11\b/i, brand: "Nike", model: "Air Jordan 11", family: "Jordan", category: "Fashion" },
  { pattern: /\bjordans?\b|\bair\s*jordans?\b/i, brand: "Nike", model: "Air Jordan", family: "Jordan", category: "Fashion" },
  { pattern: /\byeezy\s*(?:boost\s*)?350\b/i, brand: "Adidas", model: "Yeezy Boost 350", family: "Yeezy", category: "Fashion" },
  { pattern: /\byeezy\b/i, brand: "Adidas", model: "Yeezy", family: "Yeezy", category: "Fashion" },
  { pattern: /\bdunk\s*(?:low|high)?\b/i, brand: "Nike", model: "Dunk", family: "Nike", category: "Fashion" },
  { pattern: /\bnew\s*balance\s*550\b|\bnb\s*550\b/i, brand: "New Balance", model: "550", category: "Fashion" },
  { pattern: /\bnike\s*air\s*force\s*1\b|\baf1\b|\bair\s*force\s*1\b/i, brand: "Nike", model: "Air Force 1", category: "Fashion" },
  { pattern: /\bsupreme\b/i, brand: "Supreme", model: "Supreme", category: "Fashion" },
  { pattern: /\bhoodie\b|\bsweatshirt\b|\bjacket\b|\bsneaker|\btrainers?\b|\bshoes?\b/i, brand: "", model: "", category: "Fashion" },
];

const FASHION_DETECT =
  /\b(jordan|jordans|yeezy|dunk|af1|air\s*force|sneaker|trainers?|hoodie|supreme|new\s*balance|nb\s*550|fashion|clothes|jacket)\b/i;

function parseSize(text: string): Attribute | undefined {
  const m = text.match(/\b(?:size|sz)\s*([0-9]{1,2}(?:\.\d)?)\b|\b([0-9]{1,2}(?:\.\d)?)\s*(?:us|uk|eu)\b/i);
  if (!m) return undefined;
  return { key: "size", value: m[1] || m[2], provenance: "USER" };
}

function parseColour(text: string): Attribute | undefined {
  const m = text.match(/\b(black|white|red|blue|green|chicago|bred|mocha|grey|gray|olive)\b/i);
  if (!m) return undefined;
  return { key: "colourway", value: m[1], provenance: "USER" };
}

function resolve(input: DomainResolveInput): DomainResolveResult {
  const text = String(input.text || "").trim();
  if (!text || !FASHION_DETECT.test(text)) return { hit: false, score: 0 };

  let hit: FashionHit | undefined;
  for (const p of PRODUCTS) {
    if (p.pattern.test(text) && p.model) {
      hit = p;
      break;
    }
  }

  const attributes: Attribute[] = [];
  const size = parseSize(text);
  const colour = parseColour(text);
  if (size) attributes.push(size);
  if (colour) attributes.push(colour);

  const unknowns: string[] = [];
  if (!hit?.model) unknowns.push("model");
  if (!size && hit?.family === "Jordan") unknowns.push("size");

  const displayName = hit?.model
    ? [hit.model, colour?.value, size ? `Size ${size.value}` : undefined].filter(Boolean).join(" ")
    : text.slice(0, 80);

  const entity: MarketplaceEntity = {
    domain: hit?.category === "Gaming" ? "gaming" : "fashion",
    brand: hit?.brand ? { id: hit.brand.toLowerCase(), name: hit.brand } : undefined,
    family: hit?.family
      ? { id: hit.family.toLowerCase(), name: hit.family, brandId: hit.brand?.toLowerCase() }
      : undefined,
    model: hit?.model
      ? { id: hit.model.toLowerCase().replace(/\s+/g, "-"), name: hit.model }
      : undefined,
    category: {
      id: "fashion",
      label: "Fashion",
      skyDropCategory: "Fashion",
      listingTypeHint: "physical",
    },
    attributes,
    displayName,
    confidence: hit?.model ? (size ? "high" : "medium") : "low",
    provenance: hit?.model ? "LOCAL_DATA" : "MODEL_INFERENCE",
    userFacts: [size?.value && `size ${size.value}`, colour?.value].filter(Boolean) as string[],
    unknowns,
    needsCurrentCheck: ["market value", "authenticity verification"],
  };

  const clarify: DomainClarifyAsk[] = [];
  if (!hit?.model) {
    clarify.push({
      field: "model",
      question: "Which item — e.g. Jordan 1, Dunk Low, hoodie brand?",
      priority: 1,
    });
  } else if (unknowns.includes("size")) {
    clarify.push({
      field: "size",
      question: `What size for the ${hit.model}?`,
      priority: 1,
    });
  } else if (hit.model === "Air Jordan") {
    clarify.push({
      field: "model",
      question: "Which Jordan — 1, 4, 11?",
      priority: 1,
    });
  }

  return {
    hit: true,
    entity,
    clarify,
    score: hit?.model ? 0.8 : 0.4,
  };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  const has = (k: string) => entity.attributes.some((a) => a.key === k);
  if (!entity.model) asks.push({ field: "model", question: "Exact model / style?", priority: 1 });
  if (!has("size")) asks.push({ field: "size", question: "Size?", priority: 1 });
  asks.push({ field: "condition", question: "Condition / worn much?", priority: 2 });
  asks.push({ field: "price", question: "Asking price?", priority: 3 });
  asks.push({
    field: "authenticity",
    question: "Any authenticity proof? (I won't claim it's legit)",
    priority: 4,
  });
  return asks;
}

export const fashionDomain: MarketplaceDomainModule = {
  id: "fashion",
  detect: (text) => (FASHION_DETECT.test(text) ? 0.75 : 0),
  resolve,
  enrichmentPriority,
};
