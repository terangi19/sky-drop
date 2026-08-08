/**
 * Gaming pack - consoles / handhelds. Aliases + families + variants only.
 */

import type { KnowledgePack, KnowledgePackHit, KnowledgePackQuery } from "./types";

type Entry = {
  aliases: RegExp[];
  brand: string;
  family: string;
  model: string;
  variant?: string;
  identity: string;
  clarify?: string[];
  usefulFields: string[];
};

const ENTRIES: Entry[] = [
  {
    aliases: [/\bps5\s*slim\b/i, /\bplaystation\s*5\s*slim\b/i],
    brand: "Sony",
    family: "PlayStation",
    model: "PlayStation 5",
    variant: "Slim",
    identity: "PlayStation 5 Slim",
    clarify: ["Disc edition", "Digital edition"],
    usefulFields: ["edition", "controllers", "games included", "condition"],
  },
  {
    aliases: [/\bps5\s*digital\b/i, /\bplaystation\s*5\s*digital\b/i],
    brand: "Sony",
    family: "PlayStation",
    model: "PlayStation 5",
    variant: "Digital",
    identity: "PlayStation 5 Digital",
    usefulFields: ["controllers", "games included", "condition"],
  },
  {
    aliases: [/\bps5\b/i, /\bplaystation\s*5\b/i, /\bplay\s*station\s*5\b/i],
    brand: "Sony",
    family: "PlayStation",
    model: "PlayStation 5",
    identity: "PlayStation 5",
    clarify: ["Disc edition", "Digital edition", "Slim"],
    usefulFields: ["edition", "controllers", "games included", "condition"],
  },
  {
    aliases: [/\bps4\s*pro\b/i, /\bplaystation\s*4\s*pro\b/i],
    brand: "Sony",
    family: "PlayStation",
    model: "PlayStation 4",
    variant: "Pro",
    identity: "PlayStation 4 Pro",
    usefulFields: ["controllers", "games included", "condition"],
  },
  {
    aliases: [/\bps4\b/i, /\bplaystation\s*4\b/i],
    brand: "Sony",
    family: "PlayStation",
    model: "PlayStation 4",
    identity: "PlayStation 4",
    usefulFields: ["controllers", "games included", "condition"],
  },
  {
    aliases: [/\bxbox\s*series\s*x\b/i],
    brand: "Microsoft",
    family: "Xbox",
    model: "Xbox Series X",
    identity: "Xbox Series X",
    usefulFields: ["controllers", "games included", "condition"],
  },
  {
    aliases: [/\bxbox\s*series\s*s\b/i],
    brand: "Microsoft",
    family: "Xbox",
    model: "Xbox Series S",
    identity: "Xbox Series S",
    usefulFields: ["controllers", "games included", "condition"],
  },
  {
    aliases: [/\bnintendo\s*switch\s*oled\b/i, /\bswitch\s*oled\b/i],
    brand: "Nintendo",
    family: "Switch",
    model: "Nintendo Switch",
    variant: "OLED",
    identity: "Nintendo Switch OLED",
    usefulFields: ["joy-cons", "dock", "games included", "condition"],
  },
  {
    aliases: [/\bnintendo\s*switch\b/i, /\bswitch\s*console\b/i],
    brand: "Nintendo",
    family: "Switch",
    model: "Nintendo Switch",
    identity: "Nintendo Switch",
    clarify: ["OLED", "Lite", "standard"],
    usefulFields: ["joy-cons", "dock", "games included", "condition"],
  },
];

function blob(q: KnowledgePackQuery): string {
  return [q.identityText, q.brand, q.model, ...(q.visibleFacts || []), ...(q.readableFacts || [])]
    .filter(Boolean)
    .join(" ");
}

export const gamingPack: KnowledgePack = {
  id: "gaming",
  detect: (q) => {
    const t = blob(q);
    if (/\b(ps5|ps4|playstation|xbox\s*series|nintendo\s*switch|switch\s*oled|console)\b/i.test(t))
      return 0.9;
    if (/\b(gaming|game\s*console|controller)\b/i.test(t)) return 0.45;
    return 0;
  },
  retrieve: (q) => {
    const t = blob(q);
    for (const e of ENTRIES) {
      for (const re of e.aliases) {
        if (!re.test(t)) continue;
        const hit: KnowledgePackHit = {
          packId: "gaming",
          canonicalIdentity: e.identity,
          brand: e.brand,
          family: e.family,
          model: e.model,
          variant: e.variant,
          listingType: "physical",
          category: "Gaming",
          usefulFields: e.usefulFields,
          clarificationChoices: e.clarify || [],
          matchedAliases: [e.identity],
          confidence: "HIGH",
          matched: true,
        };
        return hit;
      }
    }
    if (/\b(console|game\s*console)\b/i.test(t)) {
      return {
        packId: "gaming",
        canonicalIdentity: q.identityText || "Game console",
        listingType: "physical",
        category: "Gaming",
        usefulFields: ["make", "model", "controllers", "condition"],
        clarificationChoices: ["PlayStation 5", "Xbox Series X", "Nintendo Switch", "Other"],
        matchedAliases: [],
        confidence: "LOW",
        matched: false,
      };
    }
    return null;
  },
};
