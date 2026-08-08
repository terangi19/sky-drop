/**
 * Vision -> domain classification -> targeted knowledge retrieval -> enrich observation.
 * Shared by mobile camera + desktop upload. Knowledge never blocks unknown items.
 */

import { retrieveKnowledgePack, type KnowledgePackHit } from "./awhina-knowledge-packs";
import type { VisionListingObservation, VisionObservedField } from "./awhina-vision-observation";
import { composeListingIdentity } from "./awhina-listing-identity";

export type VisionKnowledgeEnrichment = {
  observation: VisionListingObservation;
  knowledge: KnowledgePackHit;
  domain: KnowledgePackHit["packId"];
};

function bumpField(
  field: VisionObservedField,
  value: string,
  confidence: VisionObservedField["confidence"]
): VisionObservedField {
  if (!value.trim()) return field;
  if (field.value.trim() && field.confidence === "HIGH") return field;
  if (field.evidence === "INFERRED" || field.evidence === "INFERENCE" || field.evidence === "UNKNOWN" || !field.value.trim()) {
    return {
      value,
      confidence,
      evidence: "READABLE",
      note: field.note || "knowledge-pack",
    };
  }
  return field;
}

/**
 * Classify domain + retrieve pack + enrich canonical identity / category.
 * Does not invent condition, price, storage, mileage.
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
      next.displayIdentity = knowledge.canonicalIdentity;
      next.itemIdentity = bumpField(
        next.itemIdentity,
        knowledge.canonicalIdentity,
        knowledge.confidence
      );
    }
    if (knowledge.brand) {
      next.brand = bumpField(next.brand, knowledge.brand, knowledge.confidence);
    }
    if (knowledge.model) {
      next.model = bumpField(next.model, knowledge.model, knowledge.confidence);
      next.product = bumpField(
        next.product,
        knowledge.family || knowledge.model,
        knowledge.confidence
      );
    }
    if (knowledge.variant) {
      next.variant = bumpField(next.variant, knowledge.variant, knowledge.confidence);
    }
    if (knowledge.category) {
      next.category = bumpField(next.category, knowledge.category, knowledge.confidence);
    }
    if (knowledge.listingType) {
      next.listingType = bumpField(
        next.listingType,
        knowledge.listingType,
        knowledge.confidence
      );
    }
    if (knowledge.clarificationChoices.length && next.uncertainties.length === 0) {
      next.uncertainties = knowledge.clarificationChoices.slice(0, 3);
    }
    const composed = composeListingIdentity({
      brand: next.brand.value,
      product: next.product.value || next.itemIdentity.value,
      model: knowledge.generation || next.model.value,
      variant: next.variant.value,
    });
    if (composed && knowledge.confidence === "HIGH") {
      next.displayIdentity = composed;
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
