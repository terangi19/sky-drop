/**
 * Extensible domain-aware fact schemas.
 * PHONE / VEHICLE / TRADING_CARD / GAMING / GENERIC — not a giant dictionary.
 * Specialist fields are optional unless truly required to publish.
 */

import type { ListingMissingSlot } from "./awhina-pending-slots";
import { detectSellDomain } from "./awhina-pending-slots";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type AwhinaFactDomain =
  | "PHONE"
  | "VEHICLE"
  | "TRADING_CARD"
  | "GAMING"
  | "GENERIC"
  | "SERVICE"
  | "RENTAL";

export type DomainFactField = {
  key: string;
  slot?: ListingMissingSlot;
  /** Required to publish */
  required: boolean;
  /** High-value for better listings — ask only when identity is weak */
  highValue: boolean;
  /** Never invent from vision alone */
  hallucinationRisk?: boolean;
};

export type DomainFactSchema = {
  domain: AwhinaFactDomain;
  fields: DomainFactField[];
};

const VEHICLE_SCHEMA: DomainFactSchema = {
  domain: "VEHICLE",
  fields: [
    { key: "vehicleMake", required: true, highValue: true },
    { key: "vehicleModel", required: true, highValue: true },
    { key: "vehicleGeneration", slot: "generation", required: false, highValue: true },
    { key: "vehicleYear", slot: "year", required: false, highValue: true },
    { key: "price", slot: "price", required: true, highValue: true, hallucinationRisk: true },
    { key: "vehicleOdometer", slot: "odometer", required: false, highValue: true },
    { key: "condition", slot: "condition", required: false, highValue: true },
    // Keep colour/transmission before location — matches existing sell UX order
    { key: "vehicleColour", slot: "colour", required: false, highValue: true },
    { key: "vehicleTransmission", slot: "transmission", required: false, highValue: true },
    { key: "location", slot: "location", required: false, highValue: true },
    { key: "vehicleFuelType", slot: "fuel", required: false, highValue: false },
  ],
};

const PHONE_SCHEMA: DomainFactSchema = {
  domain: "PHONE",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "storage", slot: "storage", required: false, highValue: true },
    { key: "condition", slot: "condition", required: false, highValue: true },
    { key: "price", slot: "price", required: true, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const TRADING_CARD_SCHEMA: DomainFactSchema = {
  domain: "TRADING_CARD",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "cardSubject", slot: "card_subject", required: false, highValue: true },
    // Set/year/parallel — never auto-required
    { key: "cardSet", slot: "card_set", required: false, highValue: false },
    { key: "grade", slot: "grade", required: false, highValue: false, hallucinationRisk: true },
    { key: "condition", slot: "condition", required: false, highValue: true },
    { key: "price", slot: "price", required: true, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const GAMING_SCHEMA: DomainFactSchema = {
  domain: "GAMING",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "condition", slot: "condition", required: false, highValue: true },
    { key: "price", slot: "price", required: true, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const GENERIC_SCHEMA: DomainFactSchema = {
  domain: "GENERIC",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "condition", slot: "condition", required: false, highValue: true },
    { key: "price", slot: "price", required: true, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const SERVICE_SCHEMA: DomainFactSchema = {
  domain: "SERVICE",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "servicePricingType", slot: "service_rate", required: false, highValue: true },
    { key: "price", slot: "price", required: false, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const RENTAL_SCHEMA: DomainFactSchema = {
  domain: "RENTAL",
  fields: [
    { key: "title", slot: "title", required: true, highValue: true },
    { key: "price", slot: "rental_rate", required: true, highValue: true, hallucinationRisk: true },
    { key: "location", slot: "location", required: false, highValue: true },
  ],
};

const SCHEMAS: Record<AwhinaFactDomain, DomainFactSchema> = {
  VEHICLE: VEHICLE_SCHEMA,
  PHONE: PHONE_SCHEMA,
  TRADING_CARD: TRADING_CARD_SCHEMA,
  GAMING: GAMING_SCHEMA,
  GENERIC: GENERIC_SCHEMA,
  SERVICE: SERVICE_SCHEMA,
  RENTAL: RENTAL_SCHEMA,
};

export function resolveFactDomain(
  fill: Partial<SkyAiListingFill>
): AwhinaFactDomain {
  const sell = detectSellDomain(fill);
  if (sell === "vehicle") return "VEHICLE";
  if (sell === "card") return "TRADING_CARD";
  if (sell === "service") return "SERVICE";
  if (sell === "rental") return "RENTAL";
  if (sell === "electronics") return "PHONE";
  const blob = [fill.title, fill.category, ...(fill.extras || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Card cues beyond detectSellDomain keyword list
  if (
    /collectibles?/.test(blob) ||
    /\bsubject:/.test(blob) ||
    /\bset:/.test(blob) ||
    /\bgrade:/.test(blob) ||
    /\b(rookie|trading\s*card|sports\s*card)\b/.test(blob)
  ) {
    return "TRADING_CARD";
  }
  if (
    /\b(ps5|ps4|xbox|switch|nintendo|steam\s*deck|gaming|console|controller)\b/.test(
      blob
    )
  ) {
    return "GAMING";
  }
  if (/\b(iphone|samsung|pixel|phone|ipad)\b/.test(blob)) return "PHONE";
  return "GENERIC";
}

export function getDomainFactSchema(
  fill: Partial<SkyAiListingFill>
): DomainFactSchema {
  return SCHEMAS[resolveFactDomain(fill)];
}

function hasFact(fill: Partial<SkyAiListingFill>, key: string): boolean {
  switch (key) {
    case "cardSubject":
      return (fill.extras || []).some((e) =>
        e.toLowerCase().startsWith("subject:")
      );
    case "cardSet":
      return (fill.extras || []).some((e) => e.toLowerCase().startsWith("set:"));
    case "storage":
      return (
        (fill.extras || []).some((e) => e.toLowerCase().startsWith("storage:")) ||
        /\d+\s?(gb|tb)\b/i.test([fill.title, ...(fill.extras || [])].join(" "))
      );
    case "grade":
      return (fill.extras || []).some((e) => e.toLowerCase().startsWith("grade:"));
    case "servicePricingType":
      return Boolean(fill.servicePricingType || fill.price);
    default: {
      const v = (fill as Record<string, unknown>)[key];
      return typeof v === "string" ? Boolean(v.trim()) : Boolean(v);
    }
  }
}

/**
 * Ask ONLY required + high-value missing fields.
 * Trading card: do NOT auto-demand set/year/parallel.
 */
export function computeDomainAwareMissingSlots(
  fill: Partial<SkyAiListingFill>,
  opts?: { includeOptionalHighValue?: boolean; skipped?: string[] }
): ListingMissingSlot[] {
  const schema = getDomainFactSchema(fill);
  const skipped = new Set(opts?.skipped || []);
  const includeHv = opts?.includeOptionalHighValue !== false;
  const missing: ListingMissingSlot[] = [];

  // Identity weakness for cards: ask subject only when title/subject empty
  const cardIdentityWeak =
    schema.domain === "TRADING_CARD" &&
    !hasFact(fill, "cardSubject") &&
    !(fill.title || "").trim();

  for (const field of schema.fields) {
    if (!field.slot) continue;
    if (skipped.has(field.slot)) continue;
    if (hasFact(fill, field.key)) continue;

    if (field.required) {
      missing.push(field.slot);
      continue;
    }
    if (!includeHv || !field.highValue) continue;

    // Card set is never auto-asked
    if (field.slot === "card_set") continue;
    // Card subject only when identity weak
    if (field.slot === "card_subject" && !cardIdentityWeak) continue;

    missing.push(field.slot);
  }

  return [...new Set(missing)];
}

/** Targeted knowledge retrieval keys for a domain (normalize only — never override USER). */
export function knowledgeRetrievalHints(domain: AwhinaFactDomain): string[] {
  switch (domain) {
    case "VEHICLE":
      return ["make", "model", "generation", "year_range"];
    case "PHONE":
      return ["storage_options", "model_aliases"];
    case "TRADING_CARD":
      return ["subject_aliases", "set_aliases"];
    case "GAMING":
      return ["platform_aliases", "edition_aliases"];
    default:
      return [];
  }
}
