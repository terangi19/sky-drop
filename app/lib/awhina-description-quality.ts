/**
 * Universal description quality — single post-processor for all listing copy.
 * Facts-first: prose is polished/validated, never the source of truth.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import { hasCategoryIncompatibleDescription } from "./awhina-category-copy-guard";

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

/** Validation helper — description must not contradict current draft facts. */
export function descriptionContradictsDraft(
  description: string,
  fill: SkyAiListingFill,
  priorDescription?: string
): boolean {
  const lower = description.toLowerCase();
  // Stale prior-listing bleed: old location still present after change
  if (priorDescription && fill.location) {
    const oldLocs = [...priorDescription.matchAll(/\blocated in\s+([^.,!?]+)/gi)].map((m) =>
      normalizeLoc(m[1])
    );
    const newLoc = normalizeLoc(fill.location);
    for (const old of oldLocs) {
      if (old && old !== newLoc && lower.includes(old) && !lower.includes(newLoc)) {
        return true;
      }
    }
  }
  // Obvious cross-listing keywords when draft has no match
  const stalePatterns = [
    /\biphone\b/i,
    /\b256\s*gb\b/i,
    /\bhilux\b/i,
    /\btow bar\b/i,
    /\bpok[eé]mon\b/i,
  ];
  const draftBlob = `${fill.title} ${fill.description} ${(fill.extras || []).join(" ")} ${fill.vehicleMake} ${fill.vehicleModel}`.toLowerCase();
  for (const re of stalePatterns) {
    if (re.test(description) && !re.test(draftBlob)) return true;
  }
  return false;
}
