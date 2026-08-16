/**
 * Vision -> domain classification -> targeted knowledge retrieval -> enrich observation.
 * Shared by mobile camera + desktop upload. Knowledge never blocks unknown items.
 *
 * HARD RULE: knowledge packs FILL GAPS only. They must never overwrite a HIGH
 * vision identity, never launder INFERRED evidence into READABLE, and never
 * replace a richer displayIdentity with a pack alias.
 */

import { retrieveKnowledgePack, type KnowledgePackHit } from "./awhina-knowledge-packs";
import type { VisionListingObservation, VisionObservedField } from "./awhina-vision-observation";
import { composeListingIdentity } from "./awhina-listing-identity";

export type VisionKnowledgeEnrichment = {
  observation: VisionListingObservation;
  knowledge: KnowledgePackHit;
  domain: KnowledgePackHit["packId"];
};

/**
 * Fill empty / unknown fields only. Never upgrades evidence kind.
 * Never replaces an existing HIGH vision value.
 */
function fillGapField(
  field: VisionObservedField,
  value: string,
  confidence: VisionObservedField["confidence"]
): VisionObservedField {
  if (!value.trim()) return field;
  if (field.value.trim()) return field;
  if (field.confidence === "HIGH") return field;
  return {
    value,
    confidence,
    evidence: field.evidence === "UNKNOWN" ? "INFERRED" : field.evidence,
    note: field.note || "knowledge-pack-gap",
  };
}

function isRicherIdentity(candidate: string, current: string): boolean {
  const a = candidate.trim().toLowerCase();
  const b = current.trim().toLowerCase();
  if (!a) return false;
  if (!b) return true;
  if (a === b) return false;
  // Never replace a multi-token specific identity with a shorter pack label
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  if (bTokens.length >= 2 && aTokens.length < bTokens.length) return false;
  if (b.includes(a) && bTokens.length > aTokens.length) return false;
  return aTokens.length > bTokens.length || (a.includes(b) && aTokens.length >= bTokens.length);
}

/**
 * Classify domain + retrieve pack + fill gaps on canonical identity / category.
 * Does not invent condition, price, storage, mileage.
 * Does not overwrite HIGH vision identity.
 */
export function enrichObservationWithKnowledge(
  observation: VisionListingObservation
): VisionKnowledgeEnrichment {
  const identityText = [
    observation.displayIdentity,
    observation.itemIdentity.value,
    observation.brand.value,
    observation.product.value,
    observation.model.value,
    observation.variant.value,
    ...(observation.readableFacts || []),
    ...(observation.visibleFacts || []),
  ]
    .filter(Boolean)
    .join(" ");

  const knowledge = retrieveKnowledgePack({
    identityText,
    brand: observation.brand.value,
    model: observation.model.value || observation.product.value,
    category: observation.category.value,
    listingType: observation.listingType.value,
    visibleFacts: observation.visibleFacts || [],
    readableFacts: observation.readableFacts || [],
  });

  const next: VisionListingObservation = {
    ...observation,
    domain: observation.domain?.trim()
      ? observation.domain
      : knowledge.packId === "generic"
        ? "unknown"
        : knowledge.packId,
  };

  if (knowledge.matched && knowledge.confidence !== "LOW") {
    if (knowledge.canonicalIdentity) {
      next.itemIdentity = fillGapField(
        next.itemIdentity,
        knowledge.canonicalIdentity,
        knowledge.confidence
      );
      if (
        isRicherIdentity(knowledge.canonicalIdentity, next.displayIdentity) &&
        !next.displayIdentity.trim()
      ) {
        next.displayIdentity = knowledge.canonicalIdentity;
      }
    }
    if (knowledge.brand) {
      next.brand = fillGapField(next.brand, knowledge.brand, knowledge.confidence);
    }
    if (knowledge.model) {
      next.model = fillGapField(next.model, knowledge.model, knowledge.confidence);
      next.product = fillGapField(
        next.product,
        knowledge.family || knowledge.model,
        knowledge.confidence
      );
    }
    if (knowledge.variant) {
      next.variant = fillGapField(next.variant, knowledge.variant, knowledge.confidence);
    }
    if (knowledge.category) {
      next.category = fillGapField(next.category, knowledge.category, knowledge.confidence);
    }
    if (knowledge.listingType) {
      next.listingType = fillGapField(
        next.listingType,
        knowledge.listingType,
        knowledge.confidence
      );
    }
    if (knowledge.clarificationChoices.length && next.uncertainties.length === 0) {
      next.uncertainties = knowledge.clarificationChoices.slice(0, 3);
    }

    // Only compose a richer display when vision left it empty/weak and pack is HIGH.
    if (knowledge.confidence === "HIGH") {
      const composed = composeListingIdentity({
        brand: next.brand.value,
        product: next.product.value || next.itemIdentity.value,
        model: knowledge.generation || next.model.value,
        variant: next.variant.value,
      });
      if (composed && isRicherIdentity(composed, next.displayIdentity)) {
        next.displayIdentity = composed;
      }
    }
  }

  if (!next.visualDescription.trim() || next.visualDescription.length < 20) {
    const bits = [
      next.displayIdentity && `Looks like ${next.displayIdentity}.`,
      next.visibleFacts?.[0],
      next.readableFacts?.[0],
      next.visibleCondition.value &&
        next.visibleCondition.confidence !== "LOW" &&
        `Visible condition: ${next.visibleCondition.value}.`,
    ].filter(Boolean) as string[];
    if (bits.length) next.visualDescription = bits.join(" ").replace(/\s+/g, " ").trim();
  }

  return {
    observation: next,
    knowledge,
    domain: knowledge.packId,
  };
}
