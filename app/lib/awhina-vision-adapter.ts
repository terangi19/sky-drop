/**
 * Vision observation → existing StructuredListingFacts → SkyAiListingFill.
 * INPUT ADAPTER only. USER provenance always outranks IMAGE.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { composeListingIdentity } from "./awhina-listing-identity";
import {
  emptyListingFacts,
  factsToListingFill,
  maybeLockEntity,
  mergeListingFacts,
  setFact,
  type StructuredListingFacts,
} from "./awhina-listing-facts";
import {
  mapVisibleConditionToListing,
  mayPopulateFromVision,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";
import { validateListingFillFields } from "./awhina-listing-fill-tools";

export type VisionAdapterResult = {
  facts: StructuredListingFacts;
  listingFill: SkyAiListingFill;
  /** Fields held back for confirmation (MEDIUM) */
  suggestions: Array<{ field: string; value: string; confidence: string }>;
  /** Fields blocked (LOW / inference) */
  omitted: string[];
  displayIdentity: string;
  needsIdentityConfirm: boolean;
  missingPrompts: string[];
  foundReply: string;
};

function trySet(
  facts: StructuredListingFacts,
  field: Parameters<typeof setFact>[1],
  obs: VisionObservedField,
  omitted: string[],
  suggestions: VisionAdapterResult["suggestions"],
  opts?: { allowMediumPopulate?: boolean; forceHighOnly?: boolean }
): void {
  if (!obs.value.trim()) return;
  if (!mayPopulateFromVision(obs, { allowMedium: opts?.allowMediumPopulate })) {
    if (obs.value && obs.confidence === "MEDIUM" && obs.evidence !== "INFERENCE") {
      suggestions.push({
        field,
        value: obs.value,
        confidence: obs.confidence,
      });
    } else if (obs.value) {
      omitted.push(field);
    }
    return;
  }
  if (opts?.forceHighOnly && obs.confidence !== "HIGH") {
    suggestions.push({
      field,
      value: obs.value,
      confidence: obs.confidence,
    });
    return;
  }
  setFact(facts, field, obs.value, "IMAGE", obs.confidence);
}

/** Build facts bag from a single multi-photo observation. */
export function observationToListingFacts(
  obs: VisionListingObservation
): {
  facts: StructuredListingFacts;
  suggestions: VisionAdapterResult["suggestions"];
  omitted: string[];
} {
  const facts = emptyListingFacts();
  const suggestions: VisionAdapterResult["suggestions"] = [];
  const omitted: string[] = [];

  trySet(facts, "listingType", obs.listingType, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "itemIdentity", obs.itemIdentity, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "brand", obs.brand, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "model", obs.model, omitted, suggestions, {
    allowMediumPopulate: false,
  });
  trySet(facts, "variant", obs.variant, omitted, suggestions);
  trySet(facts, "category", obs.category, omitted, suggestions, {
    allowMediumPopulate: true,
  });
  trySet(facts, "colour", obs.colour, omitted, suggestions, {
    allowMediumPopulate: true,
  });

  const conditionMapped = mapVisibleConditionToListing(obs.visibleCondition);
  if (conditionMapped) {
    setFact(facts, "condition", conditionMapped, "IMAGE", obs.visibleCondition.confidence);
  } else if (obs.visibleCondition.value) {
    setFact(
      facts,
      "conditionClues",
      obs.visibleCondition.value,
      "IMAGE",
      obs.visibleCondition.confidence === "LOW" ? "MEDIUM" : obs.visibleCondition.confidence
    );
    if (obs.visibleCondition.confidence === "MEDIUM") {
      suggestions.push({
        field: "condition",
        value: obs.visibleCondition.value,
        confidence: "MEDIUM",
      });
    } else if (obs.visibleCondition.confidence === "LOW") {
      omitted.push("condition");
    }
  }

  const identity =
    obs.displayIdentity ||
    composeListingIdentity({
      brand: mayPopulateFromVision(obs.brand, { allowMedium: true })
        ? obs.brand.value
        : undefined,
      product: mayPopulateFromVision(obs.product, { allowMedium: true })
        ? obs.product.value
        : mayPopulateFromVision(obs.itemIdentity, { allowMedium: true })
          ? obs.itemIdentity.value
          : undefined,
      model: mayPopulateFromVision(obs.model) ? obs.model.value : undefined,
      variant: mayPopulateFromVision(obs.variant) ? obs.variant.value : undefined,
    });

  if (identity && (obs.overallConfidence === "HIGH" || obs.overallConfidence === "MEDIUM")) {
    setFact(facts, "title", identity, "IMAGE", obs.overallConfidence);
    setFact(facts, "itemIdentity", identity, "IMAGE", obs.overallConfidence);
  }

  // Description: safe visual observations only — never marketing
  if (obs.visualDescription && obs.overallConfidence !== "LOW") {
    setFact(facts, "description", obs.visualDescription, "IMAGE", obs.overallConfidence);
  }

  facts.visibleAttributes = [
    ...obs.visibleFeatures,
    ...obs.accessories.map((a) => `accessory:${a}`),
  ].slice(0, 24);
  facts.textFound = obs.identifiers.slice(0, 12);
  facts.identifiers = obs.identifiers.slice(0, 12);
  facts.domainExtras = obs.usefulFacts
    .filter((f) => !/\$|authentic|warranty|works|mileage|battery|storage/i.test(f))
    .slice(0, 12);

  return { facts: maybeLockEntity(facts), suggestions, omitted };
}

export function adaptVisionObservationToListing(
  obs: VisionListingObservation,
  existing?: SkyAiListingContext | null
): VisionAdapterResult {
  const { facts: visionFacts, suggestions, omitted } = observationToListingFacts(obs);

  // Preserve existing USER-confirmed context by folding vision under it
  let facts = visionFacts;
  if (existing) {
    const prior = emptyListingFacts();
    const userish = [
      "title",
      "description",
      "category",
      "condition",
      "price",
      "location",
      "listingType",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "vehicleOdometer",
      "vehicleColour",
    ] as const;
    for (const k of userish) {
      const v = (existing as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) {
        // Existing confirmed draft treated as USER-rank so it outranks IMAGE
        setFact(prior, k, v, "USER", "HIGH", { force: true });
      }
    }
    facts = mergeListingFacts(prior, visionFacts);
  }

  let listingFill = factsToListingFill(facts);
  if (!listingFill.listingType) listingFill.listingType = "physical";

  const validated = validateListingFillFields(listingFill);
  if (validated.ok) listingFill = validated.fill;

  const displayIdentity =
    obs.displayIdentity ||
    listingFill.title ||
    facts.fields.itemIdentity?.value ||
    "this item";

  const needsIdentityConfirm =
    obs.overallConfidence !== "HIGH" ||
    suggestions.some((s) => s.field === "itemIdentity" || s.field === "title");

  const missingPrompts: string[] = [];
  if (!listingFill.price) missingPrompts.push("price");
  if (!listingFill.location) missingPrompts.push("location");
  if (!listingFill.condition && !listingFill.extras?.some((e) => /^Visual:/i.test(e))) {
    // condition optional if we have visual clues; otherwise ask when selling used goods
  }

  const foundReply = needsIdentityConfirm
    ? `Āwhina found it — looks like **${displayIdentity}**. Is that right?`
    : `Āwhina found it — **${displayIdentity}**.`;

  return {
    facts,
    listingFill,
    suggestions,
    omitted,
    displayIdentity,
    needsIdentityConfirm,
    missingPrompts,
    foundReply,
  };
}

/** Build a natural description from confirmed seller bits + safe vision facts. */
export function composeVisionAwareDescription(opts: {
  sellerText?: string;
  visualDescription?: string;
  facts?: string[];
}): string {
  const parts: string[] = [];
  const seller = (opts.sellerText || "").trim();
  const visual = (opts.visualDescription || "").trim();
  if (seller) parts.push(seller);
  if (visual && !seller.toLowerCase().includes(visual.slice(0, 40).toLowerCase())) {
    parts.push(visual);
  }
  for (const f of opts.facts || []) {
    const t = f.trim();
    if (!t || /\$|authentic|warranty|works perfectly/i.test(t)) continue;
    if (parts.some((p) => p.toLowerCase().includes(t.toLowerCase()))) continue;
    parts.push(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
}
