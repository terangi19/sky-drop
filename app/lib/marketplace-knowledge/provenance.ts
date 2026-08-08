/**
 * Provenance tags for marketplace knowledge (internal only).
 * Precedence: USER > VERIFIED STRUCTURED (LOCAL_DATA) > LOOKUP > HIGH-CONFIDENCE DOMAIN > MODEL_INFERENCE
 */

import type { KnowledgeProvenance } from "./types";

export const PROVENANCE_RANK: Record<KnowledgeProvenance, number> = {
  USER: 100,
  LOCAL_DATA: 80,
  LOOKUP: 60,
  MODEL_INFERENCE: 20,
};

export function preferProvenance(
  a: KnowledgeProvenance,
  b: KnowledgeProvenance
): KnowledgeProvenance {
  return PROVENANCE_RANK[a] >= PROVENANCE_RANK[b] ? a : b;
}

/** True when incoming may overwrite existing under hierarchy. */
export function mayOverwrite(
  existing: KnowledgeProvenance | undefined,
  incoming: KnowledgeProvenance
): boolean {
  if (!existing) return true;
  return PROVENANCE_RANK[incoming] >= PROVENANCE_RANK[existing];
}

/** Never treat model inference as authoritative for prices / pop / authenticity. */
export function isHallucinationRiskField(key: string): boolean {
  return /^(price|value|market|pop|population|authenticity|msrp|worth|comps?)$/i.test(
    key
  );
}
