/**
 * Targeted knowledge retrieval for multimodal recognition.
 * Pick best pack by detect score -> retrieve. Unknown items use generic fallback.
 */

import { gamingPack } from "./gaming";
import { phonesPack } from "./phones";
import { vehiclesPack } from "./vehicles";
import {
  collectiblesPack,
  electronicsPack,
  fashionPack,
  genericFallback,
  toolsPack,
  tradingCardsPack,
} from "./generic";
import type { KnowledgePack, KnowledgePackHit, KnowledgePackQuery } from "./types";

export type { KnowledgePack, KnowledgePackHit, KnowledgePackId, KnowledgePackQuery } from "./types";

/** First-class packs first; thin bridges after. */
export const KNOWLEDGE_PACKS: KnowledgePack[] = [
  gamingPack,
  phonesPack,
  vehiclesPack,
  tradingCardsPack,
  fashionPack,
  electronicsPack,
  toolsPack,
  collectiblesPack,
];

/** Targeted retrieval - never throws, never blocks unknown items. */
export function retrieveKnowledgePack(q: KnowledgePackQuery): KnowledgePackHit {
  let bestScore = 0;
  let bestPack: KnowledgePack | null = null;

  for (const pack of KNOWLEDGE_PACKS) {
    const score = pack.detect(q);
    if (score > bestScore) {
      bestScore = score;
      bestPack = pack;
    }
  }

  if (bestPack && bestScore >= 0.4) {
    const hit = bestPack.retrieve(q);
    if (hit) return hit;
  }

  for (const pack of KNOWLEDGE_PACKS) {
    if (pack === bestPack) continue;
    if (pack.detect(q) < 0.35) continue;
    const hit = pack.retrieve(q);
    if (hit?.matched) return hit;
  }

  return genericFallback(q);
}
