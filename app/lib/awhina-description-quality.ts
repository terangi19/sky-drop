/**
 * Universal description quality — single post-processor for all listing copy.
 * Facts-first: prose is polished/validated, never the source of truth.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { hasCategoryIncompatibleDescription } from "./awhina-category-copy-guard";
import { containsInternalOrchestration } from "./awhina-orchestration-boundary";

function splitDescriptionSentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Marketplace filler that adds no seller-provided information. */
export const GENERIC_MARKETPLACE_FILLER_RE =
  /\b(?:happy to discuss what you need|work out the details from there|perfect for anyone looking|don'?t miss out on this|amazing opportunity|this fantastic item|sure to impress|great addition to any|grab yourself a bargain|ideal for enthusiasts and collectors|enthusiasts and collectors alike|standout vehicle known for|known for its performance and design|a great choice for|solid choice for|must-have for any|enhance your collection|step into a world|experience gaming like never|happy to answer questions about what you need|feel free to get in touch if you'?d like more information|happy to sort a time that works)\b/i;

export function mustRecomposeDescription(
  fill: SkyAiListingFill,
  opts?: { force?: boolean }
): boolean {
  if (opts?.force) return true;
  if (fill.replaceDraft === true) return true;
  return false;
}

function normalizeLoc(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s,]/g, " ").replace(/\s+/g, " ").trim();
}

/** Detect repeated location / condition / odometer / battery facts in prose. */
export function hasSemanticFactDuplication(description: string): boolean {
  const sentences = splitDescriptionSentences(description);
  const locations: string[] = [];
  const conditions: string[] = [];
  const odometers: string[] = [];
  const batteries: string[] = [];

  for (const s of sentences) {
    const t = s.trim();
    const loc = t.match(/^Located in\s+(.+?)[.!?]?$/i);
    if (loc) locations.push(normalizeLoc(loc[1]));
    if (/\b(?:in|located in)\s+[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?/i.test(t) && !/^Located in/i.test(t)) {
      const m = t.match(/\b(?:in|located in)\s+([A-Z][^.,!?]+)/i);
      if (m) locations.push(normalizeLoc(m[1]));
    }
    if (/\b(?:good|fair|like[- ]?new|brand new|used)\s+condition\b/i.test(t)) {
      conditions.push(t.toLowerCase().replace(/[^a-z\s-]/g, "").trim());
    }
    if (/\b[\d,]+\s*(?:km|kms|kilomet)/i.test(t)) {
      const km = (t.match(/([\d,]+)\s*(?:km|kms)/i) || [])[1]?.replace(/,/g, "");
      if (km) odometers.push(km);
    }
    if (/\b\d{1,3}\s*%\s*battery/i.test(t)) {
      batteries.push((t.match(/(\d{1,3})\s*%\s*battery/i) || [])[1] || "");
    }
  }

  const dup = (arr: string[]) => arr.length > 1 && new Set(arr.filter(Boolean)).size < arr.filter(Boolean).length;
  if (dup(locations) || dup(conditions) || dup(odometers) || dup(batteries)) return true;

  // Same city mentioned twice in different phrasing
  if (locations.length >= 2) {
    const a = locations[0];
    const b = locations[1];
    if (a && b && (a.includes(b) || b.includes(a))) return true;
  }
  return false;
}

export function containsGenericMarketplaceFiller(description: string): boolean {
  return GENERIC_MARKETPLACE_FILLER_RE.test(description);
}

function conditionKey(s: string): string | null {
  if (/\blike[- ]?new\b/i.test(s)) return "cond:like-new";
  if (/\b(?:is\s+)?in\s+fair(?:\s+used)?\s+condition\b/i.test(s)) return "cond:fair";
  if (/\b(?:is\s+)?in\s+good(?:\s+used)?\s+condition\b/i.test(s)) return "cond:good";
  if (/\bfair\b/i.test(s) && /\bcondition\b/i.test(s)) return "cond:fair";
  if (/\bgood\b/i.test(s) && /\bcondition\b/i.test(s)) return "cond:good";
  if (/\bbrand new\b/i.test(s)) return "cond:new";
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Final polish applied to every public description before storage/display. */
export function polishPublicDescription(
  description: string,
  fill: SkyAiListingFill
): string {
  let text = String(description || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const sentences = splitDescriptionSentences(text).filter((s) => {
    if (GENERIC_MARKETPLACE_FILLER_RE.test(s)) return false;
    if (hasCategoryIncompatibleDescription(s, fill)) return false;
    return true;
  });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sentences) {
    let key = s.toLowerCase().replace(/\s+/g, " ").slice(0, 64);
    const loc = s.match(/^Located in\s+(.+?)[.!?]?$/i);
    if (loc) key = `loc:${normalizeLoc(loc[1])}`;
    const ck = conditionKey(s);
    if (ck) key = ck;
    const km = s.match(/([\d,]+)\s*(?:km|kms)/i);
    if (km) key = `odo:${km[1].replace(/,/g, "")}`;
    const batt = s.match(/(\d{1,3})\s*%\s*battery/i);
    if (batt) key = `battery:${batt[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  const located = out.find((s) => /^Located in\s+/i.test(s));
  if (located) {
    const locName = located.match(/^Located in\s+(.+?)[.!?]?$/i)?.[1]?.trim();
    if (locName) {
      for (let i = 0; i < out.length; i++) {
        if (/^Located in\s+/i.test(out[i])) continue;
        out[i] = out[i]
          .replace(
            new RegExp(
              `\\s+in\\s+${escapeRegExp(locName)}(?=\\s+in\\s+(?:good|fair|like|brand|used))`,
              "gi"
            ),
            ""
          )
          .replace(new RegExp(`\\s+in\\s+${escapeRegExp(locName)}(?=[.,!?]|$)`, "gi"), "")
          .replace(new RegExp(`\\s*,\\s*${escapeRegExp(locName)}(?=[.,!?]|$)`, "gi"), "")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    }
  }

  return out.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export type DescriptionQualityViolation =
  | "empty_when_facts_exist"
  | "marketing_filler"
  | "semantic_duplicate"
  | "category_incompatible"
  | "orchestration_leak"
  | "wrong_domain_language"
  | "wanted_sounds_like_sale"
  | "service_sounds_like_product"
  | "rental_sounds_like_sale"
  | "invented_collectible_hype"
  | "stale_prior_listing";

const INVENTED_COLLECTIBLE_HYPE_RE =
  /\b(?:rare(?:ly)?|highly sought[- ]after|investment potential|sure to appreciate|iconic status|legendary status|valuable addition)\b/i;

const SERVICE_AS_PRODUCT_RE =
  /\b(?:item|product|listing)\s+in\s+(?:good|fair|like[- ]?new|brand new)(?:\s+used)?\s+condition\b/i;

const PRODUCT_AS_SERVICE_RE = /\b(?:per hour|hourly rate|quote required for the job)\b/i;

export type DescriptionQualityContractResult =
  | { ok: true; description: string }
  | { ok: false; violations: DescriptionQualityViolation[]; description: string };

function listingDomain(fill: SkyAiListingFill): string {
  return String(fill.listingType || "physical").toLowerCase();
}

function draftFactBlob(fill: SkyAiListingFill): string {
  return [
    fill.title,
    fill.location,
    fill.condition,
    fill.vehicleMake,
    fill.vehicleModel,
    fill.vehicleYear,
    fill.vehicleOdometer,
    ...(fill.extras || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Category-independent quality contract — no product-specific templates. */
export function validateDescriptionQualityContract(
  description: string | undefined | null,
  fill: SkyAiListingFill,
  opts?: { priorDescription?: string; requireNonEmpty?: boolean }
): DescriptionQualityContractResult {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  const violations: DescriptionQualityViolation[] = [];
  if (!text) {
    if (opts?.requireNonEmpty) violations.push("empty_when_facts_exist");
    return violations.length ? { ok: false, violations, description: "" } : { ok: true, description: "" };
  }

  if (containsGenericMarketplaceFiller(text)) violations.push("marketing_filler");
  if (hasSemanticFactDuplication(text)) violations.push("semantic_duplicate");
  if (hasCategoryIncompatibleDescription(text, fill)) violations.push("category_incompatible");
  if (containsInternalOrchestration(text)) violations.push("orchestration_leak");

  const domain = listingDomain(fill);
  if (domain === "service") {
    if (SERVICE_AS_PRODUCT_RE.test(text)) violations.push("service_sounds_like_product");
    if (/\bfor sale\b/i.test(text)) violations.push("wrong_domain_language");
  } else if (domain === "rental") {
    if (/\b(?:selling my|for sale|up for sale)\b/i.test(text)) violations.push("rental_sounds_like_sale");
  } else if (domain === "wanted") {
    if (/\b(?:for sale|selling my|available to buy|buy now)\b/i.test(text)) {
      violations.push("wanted_sounds_like_sale");
    }
  } else if (PRODUCT_AS_SERVICE_RE.test(text)) {
    violations.push("wrong_domain_language");
  }

  const factBlob = draftFactBlob(fill);
  if (
    fill.category?.toLowerCase() === "collectibles" ||
    /\b(?:card|graded|psa|bgs|cgc)\b/i.test(`${fill.title} ${(fill.extras || []).join(" ")}`)
  ) {
    if (INVENTED_COLLECTIBLE_HYPE_RE.test(text) && !INVENTED_COLLECTIBLE_HYPE_RE.test(factBlob)) {
      violations.push("invented_collectible_hype");
    }
  }

  if (opts?.priorDescription && opts.priorDescription.trim().length > 20 && fill.replaceDraft) {
    const prior = opts.priorDescription.toLowerCase();
    const priorTokens = prior
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4)
      .filter((w) => !factBlob.includes(w));
    const bleed = priorTokens.filter((w) => text.toLowerCase().includes(w)).slice(0, 3);
    if (bleed.length >= 2) violations.push("stale_prior_listing");
  }

  if (violations.length) return { ok: false, violations, description: text };
  return { ok: true, description: text };
}

/** Last-resort factual copy when writer + deterministic paths fail contract. */
export function minimalSafeDescription(fill: SkyAiListingFill): string {
  const domain = listingDomain(fill);
  const title = (fill.title || "Listing").trim();
  const loc = (fill.location || fill.pickupArea || "").trim();
  const hasUsefulFact = Boolean(
    fill.condition?.trim() ||
      loc ||
      fill.vehicleYear?.trim() ||
      fill.vehicleOdometer?.trim() ||
      fill.vehicleGeneration?.trim() ||
      (fill.extras || []).some((e) => String(e).trim().length > 0)
  );
  if (!hasUsefulFact && (domain === "vehicle" || domain === "physical")) {
    return "";
  }
  if (domain === "wanted") {
    return loc ? `Looking for ${title.toLowerCase()} in ${loc}.` : `Looking for ${title.toLowerCase()}.`;
  }
  if (domain === "service") {
    return loc ? `${title} available in ${loc}.` : `${title} available.`;
  }
  if (domain === "rental") {
    return loc ? `${title} available to hire in ${loc}.` : `${title} available to hire.`;
  }
  if (loc) return `${title}. Located in ${loc}.`;
  return `${title}.`;
}
