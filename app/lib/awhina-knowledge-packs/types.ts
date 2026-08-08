/**
 * Modular product knowledge packs for multimodal recognition.
 * Enrichment only - never blocks unknown items. Not a second listing brain.
 */

import type { AwhinaConfidenceLevel } from "../awhina-confidence-levels";

export type KnowledgePackId =
  | "gaming"
  | "phones"
  | "vehicles"
  | "trading-cards"
  | "fashion"
  | "electronics"
  | "tools"
  | "collectibles"
  | "generic";

export type KnowledgePackHit = {
  packId: KnowledgePackId;
  canonicalIdentity: string;
  brand?: string;
  family?: string;
  model?: string;
  variant?: string;
  generation?: string;
  listingType?: "physical" | "vehicle" | "digital" | "service" | "rental";
  category?: string;
  usefulFields: string[];
  clarificationChoices: string[];
  matchedAliases: string[];
  confidence: AwhinaConfidenceLevel;
  matched: boolean;
};

export type KnowledgePackQuery = {
  identityText: string;
  brand?: string;
  model?: string;
  category?: string;
  listingType?: string;
  visibleFacts?: string[];
  readableFacts?: string[];
};

export type KnowledgePack = {
  id: KnowledgePackId;
  detect: (q: KnowledgePackQuery) => number;
  retrieve: (q: KnowledgePackQuery) => KnowledgePackHit | null;
};
