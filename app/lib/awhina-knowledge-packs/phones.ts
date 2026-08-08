/**
 * Phones pack - iPhone / Samsung / Pixel. No invented storage or battery.
 */

import type { KnowledgePack, KnowledgePackHit, KnowledgePackQuery } from "./types";

type Entry = {
  aliases: RegExp[];
  brand: string;
  family: string;
  model: string;
  identity: string;
  clarify?: string[];
};

const ENTRIES: Entry[] = [
  { aliases: [/\biphone\s*15\s*pro\s*max\b/i], brand: "Apple", family: "iPhone", model: "iPhone 15 Pro Max", identity: "iPhone 15 Pro Max" },
  { aliases: [/\biphone\s*15\s*pro\b/i], brand: "Apple", family: "iPhone", model: "iPhone 15 Pro", identity: "iPhone 15 Pro" },
  { aliases: [/\biphone\s*15\b/i], brand: "Apple", family: "iPhone", model: "iPhone 15", identity: "iPhone 15", clarify: ["15", "15 Plus", "15 Pro", "15 Pro Max"] },
  { aliases: [/\biphone\s*14\s*pro\s*max\b/i], brand: "Apple", family: "iPhone", model: "iPhone 14 Pro Max", identity: "iPhone 14 Pro Max" },
  { aliases: [/\biphone\s*14\s*pro\b/i], brand: "Apple", family: "iPhone", model: "iPhone 14 Pro", identity: "iPhone 14 Pro" },
  { aliases: [/\biphone\s*14\b/i], brand: "Apple", family: "iPhone", model: "iPhone 14", identity: "iPhone 14" },
  { aliases: [/\biphone\s*13\s*pro\b/i], brand: "Apple", family: "iPhone", model: "iPhone 13 Pro", identity: "iPhone 13 Pro" },
  { aliases: [/\biphone\s*13\b/i], brand: "Apple", family: "iPhone", model: "iPhone 13", identity: "iPhone 13" },
  { aliases: [/\biphone\b/i], brand: "Apple", family: "iPhone", model: "iPhone", identity: "iPhone", clarify: ["Which iPhone model?"] },
  { aliases: [/\bgalaxy\s*s24\s*ultra\b/i, /\bs24\s*ultra\b/i], brand: "Samsung", family: "Galaxy", model: "Galaxy S24 Ultra", identity: "Samsung Galaxy S24 Ultra" },
  { aliases: [/\bgalaxy\s*s24\b/i, /\bsamsung\s*s24\b/i], brand: "Samsung", family: "Galaxy", model: "Galaxy S24", identity: "Samsung Galaxy S24" },
  { aliases: [/\bgalaxy\s*s23\b/i, /\bsamsung\s*s23\b/i], brand: "Samsung", family: "Galaxy", model: "Galaxy S23", identity: "Samsung Galaxy S23" },
  { aliases: [/\bsamsung\s*galaxy\b/i], brand: "Samsung", family: "Galaxy", model: "Galaxy", identity: "Samsung Galaxy", clarify: ["Which Galaxy model?"] },
  { aliases: [/\bpixel\s*8\s*pro\b/i], brand: "Google", family: "Pixel", model: "Pixel 8 Pro", identity: "Google Pixel 8 Pro" },
  { aliases: [/\bpixel\s*8\b/i], brand: "Google", family: "Pixel", model: "Pixel 8", identity: "Google Pixel 8" },
];

const USEFUL = ["storage", "colour", "condition", "battery health (seller)", "carrier / Dual SIM"];

function blob(q: KnowledgePackQuery): string {
  return [q.identityText, q.brand, q.model, ...(q.readableFacts || []), ...(q.visibleFacts || [])]
    .filter(Boolean)
    .join(" ");
}

export const phonesPack: KnowledgePack = {
  id: "phones",
  detect: (q) => {
    const t = blob(q);
    if (/\b(iphone|galaxy\s*s\d|pixel\s*\d|samsung\s*galaxy|android\s*phone)\b/i.test(t)) return 0.92;
    if (/\b(phone|smartphone|mobile)\b/i.test(t)) return 0.5;
    return 0;
  },
  retrieve: (q) => {
    const t = blob(q);
    for (const e of ENTRIES) {
      for (const re of e.aliases) {
        if (!re.test(t)) continue;
        const hit: KnowledgePackHit = {
          packId: "phones",
          canonicalIdentity: e.identity,
          brand: e.brand,
          family: e.family,
          model: e.model,
          listingType: "physical",
          category: "Tech",
          usefulFields: USEFUL,
          clarificationChoices: e.clarify || [],
          matchedAliases: [e.identity],
          confidence: e.model === "iPhone" || e.model === "Galaxy" ? "MEDIUM" : "HIGH",
          matched: true,
        };
        return hit;
      }
    }
    if (/\b(phone|smartphone)\b/i.test(t)) {
      return {
        packId: "phones",
        canonicalIdentity: q.identityText || "Smartphone",
        listingType: "physical",
        category: "Tech",
        usefulFields: USEFUL,
        clarificationChoices: ["iPhone", "Samsung Galaxy", "Google Pixel", "Other"],
        matchedAliases: [],
        confidence: "LOW",
        matched: false,
      };
    }
    return null;
  },
};
