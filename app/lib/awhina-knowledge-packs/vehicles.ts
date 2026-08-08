/**
 * Vehicles pack - targeted aliases + marketplace vehicles domain bridge.
 * Never invents year/odometer/trim. Knowledge enriches only.
 */

import { resolveMarketplaceKnowledge } from "../marketplace-knowledge";
import type { KnowledgePack, KnowledgePackHit, KnowledgePackQuery } from "./types";

type Entry = {
  aliases: RegExp[];
  brand: string;
  family: string;
  model: string;
  generation?: string;
  identity: string;
  clarify?: string[];
};

const ENTRIES: Entry[] = [
  { aliases: [/\bskyline\s*r34\b/i, /\br34\s*(?:gtr|gt-?r)?\b/i], brand: "Nissan", family: "Skyline", model: "Skyline", generation: "R34", identity: "Nissan Skyline R34", clarify: ["GT-R", "GT-T", "25GT"] },
  { aliases: [/\bskyline\s*r33\b/i, /\br33\s*(?:gtr|gt-?r)?\b/i], brand: "Nissan", family: "Skyline", model: "Skyline", generation: "R33", identity: "Nissan Skyline R33" },
  { aliases: [/\bskyline\s*r32\b/i, /\br32\s*(?:gtr|gt-?r)?\b/i], brand: "Nissan", family: "Skyline", model: "Skyline", generation: "R32", identity: "Nissan Skyline R32" },
  { aliases: [/\bnissan\s*skyline\b/i, /\bskyline\b/i], brand: "Nissan", family: "Skyline", model: "Skyline", identity: "Nissan Skyline", clarify: ["R32", "R33", "R34"] },
  { aliases: [/\bbmw\s*335i\b/i, /\b335i\b/i], brand: "BMW", family: "3 Series", model: "335i", identity: "BMW 335i", clarify: ["E90", "E92", "E93"] },
  { aliases: [/\bbmw\s*320i\b/i, /\b320i\b/i], brand: "BMW", family: "3 Series", model: "320i", identity: "BMW 320i" },
  { aliases: [/\bbmw\s*3\s*series\b/i], brand: "BMW", family: "3 Series", model: "3 Series", identity: "BMW 3 Series", clarify: ["Which model? (e.g. 320i, 335i)"] },
  { aliases: [/\btoyota\s*supra\b/i, /\bsupra\b/i], brand: "Toyota", family: "Supra", model: "Supra", identity: "Toyota Supra" },
  { aliases: [/\bford\s*ranger\b/i], brand: "Ford", family: "Ranger", model: "Ranger", identity: "Ford Ranger" },
  { aliases: [/\btoyota\s*hilux\b/i, /\bhilux\b/i], brand: "Toyota", family: "Hilux", model: "Hilux", identity: "Toyota Hilux" },
];

const USEFUL = ["year", "odometer", "transmission", "fuel type", "body type", "colour", "WOF / rego (seller)"];

function blob(q: KnowledgePackQuery): string {
  return [q.identityText, q.brand, q.model, ...(q.readableFacts || []), ...(q.visibleFacts || [])]
    .filter(Boolean)
    .join(" ");
}

export const vehiclesPack: KnowledgePack = {
  id: "vehicles",
  detect: (q) => {
    const t = blob(q);
    if (q.listingType === "vehicle") return 0.95;
    if (/\b(bmw|nissan|toyota|mazda|honda|ford|subaru|skyline|supra|hilux|ranger|ute|car|vehicle|r[\s-]?3[2-4]|e9[0-3])\b/i.test(t))
      return 0.9;
    return 0;
  },
  retrieve: (q) => {
    const t = blob(q);
    for (const e of ENTRIES) {
      for (const re of e.aliases) {
        if (!re.test(t)) continue;
        const high =
          Boolean(e.generation) || (e.model !== "3 Series" && e.model !== "BMW");
        return {
          packId: "vehicles",
          canonicalIdentity: e.identity,
          brand: e.brand,
          family: e.family,
          model: e.model,
          generation: e.generation,
          listingType: "vehicle",
          category: "Cars",
          usefulFields: USEFUL,
          clarificationChoices: e.clarify || [],
          matchedAliases: [e.identity],
          confidence: high ? "HIGH" : "MEDIUM",
          matched: true,
        } satisfies KnowledgePackHit;
      }
    }

    const mk = resolveMarketplaceKnowledge(t);
    if (mk.entity && mk.entity.domain === "vehicles" && mk.entity.confidence !== "low") {
      return {
        packId: "vehicles",
        canonicalIdentity: mk.entity.displayName,
        brand: mk.listingHints.vehicleMake || mk.entity.brand?.name,
        model: mk.listingHints.vehicleModel || mk.entity.model?.name,
        generation: mk.entity.generation?.code || mk.entity.generation?.name,
        listingType: "vehicle",
        category: "Cars",
        usefulFields: USEFUL,
        clarificationChoices: (mk.clarify || []).map((c) => c.question).slice(0, 4),
        matchedAliases: [],
        confidence: mk.entity.confidence === "high" ? "HIGH" : "MEDIUM",
        matched: true,
      };
    }

    if (/\b(car|ute|vehicle|sedan|hatch|suv)\b/i.test(t)) {
      return {
        packId: "vehicles",
        canonicalIdentity: q.identityText || "Vehicle",
        listingType: "vehicle",
        category: "Cars",
        usefulFields: USEFUL,
        clarificationChoices: ["Make?", "Model?", "Year?"],
        matchedAliases: [],
        confidence: "LOW",
        matched: false,
      };
    }
    return null;
  },
};
