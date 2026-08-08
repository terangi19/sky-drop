/**
 * Thin packs + generic fallback - enrich when possible, never block unknowns.
 */

import { resolveMarketplaceKnowledge } from "../marketplace-knowledge";
import type { KnowledgePack, KnowledgePackHit, KnowledgePackQuery } from "./types";

function blob(q: KnowledgePackQuery): string {
  return [q.identityText, q.brand, q.model, ...(q.visibleFacts || [])].filter(Boolean).join(" ");
}

function fromMarketplace(
  packId: KnowledgePackHit["packId"],
  q: KnowledgePackQuery,
  domainHint: string
): KnowledgePackHit | null {
  const t = blob(q);
  if (!t.trim()) return null;
  const mk = resolveMarketplaceKnowledge(t);
  if (!mk.entity || mk.entity.domain === "unknown") return null;
  if (domainHint !== "any" && mk.entity.domain !== domainHint) return null;
  return {
    packId,
    canonicalIdentity: mk.entity.displayName || q.identityText,
    brand: mk.entity.brand?.name,
    model: mk.entity.model?.name,
    variant: mk.entity.variant?.name,
    listingType: mk.listingHints.listingType as KnowledgePackHit["listingType"],
    category: mk.listingHints.category || mk.entity.category?.skyDropCategory,
    usefulFields: [],
    clarificationChoices: (mk.clarify || []).map((c) => c.question).filter(Boolean).slice(0, 4),
    matchedAliases: [],
    confidence:
      mk.entity.confidence === "high"
        ? "HIGH"
        : mk.entity.confidence === "medium"
          ? "MEDIUM"
          : "LOW",
    matched: mk.entity.confidence !== "low",
  };
}

export const tradingCardsPack: KnowledgePack = {
  id: "trading-cards",
  detect: (q) =>
    /\b(psa|bgs|cgc|topps|panini|pokemon|yugioh|trading\s*card|graded\s*card|messi|rookie)\b/i.test(
      blob(q)
    )
      ? 0.85
      : 0,
  retrieve: (q) => fromMarketplace("trading-cards", q, "collectibles"),
};

export const fashionPack: KnowledgePack = {
  id: "fashion",
  detect: (q) =>
    /\b(nike|adidas|jordan|yeezy|sneakers?|shoes?|hoodie|jacket)\b/i.test(blob(q)) ? 0.8 : 0,
  retrieve: (q) => fromMarketplace("fashion", q, "fashion"),
};

export const electronicsPack: KnowledgePack = {
  id: "electronics",
  detect: (q) =>
    /\b(laptop|macbook|ipad|tv|headphones|airpods|tablet|camera)\b/i.test(blob(q)) ? 0.75 : 0,
  retrieve: (q) => fromMarketplace("electronics", q, "electronics"),
};

export const toolsPack: KnowledgePack = {
  id: "tools",
  detect: (q) =>
    /\b(drill|saw|grinder|ladder|generator|tools?|dewalt|makita|milwaukee)\b/i.test(blob(q))
      ? 0.8
      : 0,
  retrieve: (q) => {
    const mk = fromMarketplace("tools", q, "equipment");
    if (mk) return mk;
    if (/\b(drill|tool)\b/i.test(blob(q))) {
      return {
        packId: "tools",
        canonicalIdentity: q.identityText || "Tool",
        listingType: "physical",
        category: "Home",
        usefulFields: ["brand", "condition", "battery/corded"],
        clarificationChoices: [],
        matchedAliases: [],
        confidence: "LOW",
        matched: false,
      };
    }
    return null;
  },
};

export const collectiblesPack: KnowledgePack = {
  id: "collectibles",
  detect: (q) => (/\b(collectible|figurine|lego|vinyl|antique)\b/i.test(blob(q)) ? 0.6 : 0),
  retrieve: (q) => fromMarketplace("collectibles", q, "collectibles"),
};

/** Always available - pipeline continues for unknown items. */
export function genericFallback(q: KnowledgePackQuery): KnowledgePackHit {
  return {
    packId: "generic",
    canonicalIdentity: (q.identityText || "Item").trim() || "Item",
    listingType:
      q.listingType === "vehicle"
        ? "vehicle"
        : q.listingType === "digital"
          ? "digital"
          : "physical",
    category: q.category || "Other",
    usefulFields: ["title", "price", "location", "condition"],
    clarificationChoices: [],
    matchedAliases: [],
    confidence: "LOW",
    matched: false,
  };
}
