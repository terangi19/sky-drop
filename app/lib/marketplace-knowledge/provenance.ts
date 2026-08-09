/**
 * Provenance tags for marketplace knowledge (internal only).
 * Precedence: USER > IMAGE > LOCAL_DATA (LOCAL_KNOWLEDGE) > LOOKUP > MODEL_INFERENCE
 *
 * Full authority hierarchy (USER_CORRECTED / USER_CONFIRMED / …) lives in
 * awhina-authority.ts — knowledge ranks remain compatible subset.
 */

import type { KnowledgeProvenance } from "./types";

export const PROVENANCE_RANK: Record<KnowledgeProvenance, number> = {
  USER: 100,
  IMAGE: 85,
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
  // USER facts are never overwritten by non-USER sources
  if (existing === "USER" && incoming !== "USER") return false;
  return PROVENANCE_RANK[incoming] >= PROVENANCE_RANK[existing];
}

/** Never treat model inference / vision as authoritative for prices / pop / authenticity. */
export function isHallucinationRiskField(key: string): boolean {
  return /^(price|value|market|pop|population|authenticity|msrp|worth|comps?|battery|warranty|grade|mechanical)$/i.test(
    key
  );
}
