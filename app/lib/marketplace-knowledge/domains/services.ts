/**
 * Services domain — light first slice (e.g. car detailing).
 */

import type {
  DomainResolveInput,
  DomainResolveResult,
  MarketplaceDomainModule,
  MarketplaceEntity,
  DomainClarifyAsk,
  Attribute,
} from "../types";

const SERVICE_ALIASES: ReadonlyArray<{ pattern: RegExp; name: string; category: string }> = [
  { pattern: /\bcar\s*detail(?:ing)?\b|\bdetail(?:ing)?\s*(?:car|vehicle|auto)\b/i, name: "Car detailing", category: "Cleaning & Maintenance" },
  { pattern: /\blawn\s*mowing\b|\bmowing\b/i, name: "Lawn mowing", category: "Trades & Repairs" },
  { pattern: /\bhouse\s*clean(?:ing)?\b|\bcleaning\s*service\b/i, name: "House cleaning", category: "Cleaning & Maintenance" },
  { pattern: /\bhandyman\b/i, name: "Handyman", category: "Trades & Repairs" },
  { pattern: /\bplumbing\b|\bplumber\b/i, name: "Plumbing", category: "Trades & Repairs" },
  { pattern: /\btutor(?:ing)?\b|\blessons?\b/i, name: "Tutoring", category: "Tutoring & Lessons" },
  { pattern: /\bphotograph(?:y|er)\b/i, name: "Photography", category: "Photography" },
];

const SERVICE_DETECT =
  /\b(detailing|car\s*detail|lawn\s*mowing|mowing|house\s*clean|handyman|plumb(?:er|ing)|tutor(?:ing)?|photograph(?:y|er)|service\b|per\s*hour|hourly)\b/i;

function resolve(input: DomainResolveInput): DomainResolveResult {
  const text = String(input.text || "").trim();
  if (!text || !SERVICE_DETECT.test(text)) return { hit: false, score: 0 };

  let name = "";
  let category = "Other Services";
  for (const row of SERVICE_ALIASES) {
    if (row.pattern.test(text)) {
      name = row.name;
      category = row.category;
      break;
    }
  }

  const attributes: Attribute[] = [];
  const hourly = text.match(/\$?\s*([\d,]+)\s*(?:\/|\s*per\s*)\s*hour/i);
  const fixed = text.match(/\$\s*([\d,]+)/);
  if (hourly) {
    attributes.push({ key: "hourlyRate", value: hourly[1].replace(/,/g, ""), provenance: "USER" });
  } else if (fixed) {
    attributes.push({ key: "price", value: fixed[1].replace(/,/g, ""), provenance: "USER" });
  }

  const pricingType = hourly ? "Hourly Rate" : fixed ? "Fixed Price" : undefined;

  const entity: MarketplaceEntity = {
    domain: "services",
    model: name ? { id: name.toLowerCase().replace(/\s+/g, "-"), name } : undefined,
    category: {
      id: "services",
      label: category,
      skyDropCategory: category,
      listingTypeHint: "service",
    },
    attributes,
    displayName: name || text.slice(0, 80),
    confidence: name ? "high" : "medium",
    provenance: "LOCAL_DATA",
    userFacts: [
      ...(hourly ? [`$${hourly[1]}/hr`] : []),
      ...(pricingType ? [pricingType] : []),
    ],
    unknowns: !hourly && !fixed ? ["price"] : [],
    needsCurrentCheck: [],
  };

  const clarify: DomainClarifyAsk[] = [];
  if (!name) {
    clarify.push({
      field: "service",
      question: "What service — e.g. car detailing, lawn mowing, tutoring?",
      priority: 1,
    });
  } else if (!hourly && !fixed) {
    clarify.push({
      field: "price",
      question: `${name}: fixed price, hourly, or quote required?`,
      priority: 1,
    });
  }

  return { hit: true, entity, clarify, score: name ? 0.85 : 0.45 };
}

function enrichmentPriority(entity: MarketplaceEntity): DomainClarifyAsk[] {
  const asks: DomainClarifyAsk[] = [];
  if (!entity.attributes.some((a) => a.key === "price" || a.key === "hourlyRate")) {
    asks.push({
      field: "price",
      question: "Fixed, hourly, or quote required?",
      priority: 1,
    });
  }
  asks.push({ field: "location", question: "Service area?", priority: 2 });
  asks.push({ field: "duration", question: "Typical duration?", priority: 3 });
  return asks;
}

export const servicesDomain: MarketplaceDomainModule = {
  id: "services",
  detect: (text) => (SERVICE_DETECT.test(text) ? 0.75 : 0),
  resolve,
  enrichmentPriority,
};
