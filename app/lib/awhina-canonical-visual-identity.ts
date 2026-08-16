/**
 * ONE authoritative visual identity for a photographed marketplace object.
 *
 * Vision produces structured evidence; this module composes the durable
 * CanonicalVisualIdentity that title, description, category, and questions
 * all consume. Downstream systems must not re-identify from scratch.
 */

import type { AwhinaObjectType } from "./awhina-domain-knowledge";
import {
  categoryForAwhinaObjectType,
  normalizeAwhinaObjectType,
} from "./awhina-domain-knowledge";
import { composeListingIdentity } from "./awhina-listing-identity";
import type { AwhinaConfidenceLevel } from "./awhina-confidence-levels";
import {
  mayPopulateFromVision,
  type VisionListingObservation,
  type VisionObservedField,
} from "./awhina-vision-observation";

export type CanonicalIdentityFieldConfidence = AwhinaConfidenceLevel;

export type CanonicalVisualIdentity = {
  domain: string;
  objectType: AwhinaObjectType;
  brand: string | null;
  productFamily: string | null;
  model: string | null;
  generation: string | null;
  variant: string | null;
  franchise: string | null;
  set: string | null;
  season: string | null;
  productFormat: string | null;
  colour: string | null;
  /** Short marketplace label — richest supported identity, never a bare domain noun. */
  displayName: string;
  visibleAttributes: string[];
  visibleText: string[];
  confidenceByField: Partial<
    Record<
      | "objectType"
      | "brand"
      | "productFamily"
      | "model"
      | "generation"
      | "variant"
      | "franchise"
      | "set"
      | "season"
      | "productFormat"
      | "colour"
      | "displayName",
      CanonicalIdentityFieldConfidence
    >
  >;
  overallConfidence: CanonicalIdentityFieldConfidence;
  /** Uncertain but important fields that conversation should ask about. */
  uncertainImportant: string[];
  evidenceNotes: string[];
};

function fieldValue(
  field: VisionObservedField | undefined,
  opts?: { allowMedium?: boolean }
): { value: string | null; confidence: CanonicalIdentityFieldConfidence | null } {
  if (!field?.value?.trim()) return { value: null, confidence: null };
  if (!mayPopulateFromVision(field, { allowMedium: opts?.allowMedium !== false })) {
    return { value: null, confidence: field.confidence };
  }
  return { value: field.value.trim(), confidence: field.confidence };
}

function pickRicher(
  a: string | null,
  b: string | null
): string | null {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function preferHigherConfidence(
  current: CanonicalIdentityFieldConfidence | undefined,
  next: CanonicalIdentityFieldConfidence | undefined
): CanonicalIdentityFieldConfidence | undefined {
  const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  if (!next) return current;
  if (!current) return next;
  return rank[next] >= rank[current] ? next : current;
}

/**
 * Compose the canonical identity from a vision observation.
 * Preserves every hierarchical level the evidence supports; never collapses
 * to a bare domain ("car", "trading card") when richer parts exist.
 */
export function composeCanonicalVisualIdentity(
  obs: VisionListingObservation
): CanonicalVisualIdentity {
  const objectTypeRaw = fieldValue(obs.objectType, { allowMedium: true });
  const objectType = normalizeAwhinaObjectType(
    objectTypeRaw.value
      ? `objectType:${objectTypeRaw.value}`
      : [
          obs.displayIdentity,
          obs.itemIdentity.value,
          obs.productFormat?.value,
          obs.product?.value,
          obs.model?.value,
          obs.brand?.value,
          obs.domain,
        ]
          .filter(Boolean)
          .join(" ")
  );

  const brand = fieldValue(obs.brand, { allowMedium: true });
  const product = fieldValue(obs.product, { allowMedium: true });
  const model = fieldValue(obs.model, { allowMedium: true });
  const variant = fieldValue(obs.variant, { allowMedium: true });
  const set = fieldValue(obs.cardSet, { allowMedium: true });
  const season = fieldValue(obs.season, { allowMedium: true });
  const franchise = fieldValue(obs.league, { allowMedium: true });
  const productFormat = fieldValue(obs.productFormat, { allowMedium: true });
  const colour = fieldValue(obs.colour, { allowMedium: true });

  // Generation often lands in variant or model for vehicles (E92, R34).
  const generationCandidate: {
    value: string | null;
    confidence: CanonicalIdentityFieldConfidence | null;
  } =
    model.value && /\b([A-Z]?\d{2,3}[A-Z]?|[A-Z]\d{2})\b/.test(model.value)
      ? { value: null, confidence: null }
      : variant.value && /\b(e\d{2}|r\d{2}|f\d{2}|g\d{2})\b/i.test(variant.value)
        ? { value: variant.value, confidence: variant.confidence }
        : { value: null, confidence: null };

  const composed = composeListingIdentity({
    brand: brand.value,
    product: product.value || obs.itemIdentity.value || undefined,
    model: model.value,
    generation: generationCandidate.value,
    variant:
      generationCandidate.value && variant.value === generationCandidate.value
        ? undefined
        : variant.value,
  });

  const displayName =
    (obs.overallConfidence !== "LOW" && obs.displayIdentity.trim()
      ? obs.displayIdentity.trim()
      : "") ||
    composed ||
    product.value ||
    brand.value ||
    (objectType !== "unknown" ? objectType.replace(/_/g, " ") : "") ||
    "this item";

  const confidenceByField: CanonicalVisualIdentity["confidenceByField"] = {};
  if (objectTypeRaw.confidence) confidenceByField.objectType = objectTypeRaw.confidence;
  else if (objectType !== "unknown") confidenceByField.objectType = "MEDIUM";
  if (brand.confidence) confidenceByField.brand = brand.confidence;
  if (product.confidence) confidenceByField.productFamily = product.confidence;
  if (model.confidence) confidenceByField.model = model.confidence;
  if (generationCandidate.confidence) {
    confidenceByField.generation = generationCandidate.confidence;
  }
  if (variant.confidence) confidenceByField.variant = variant.confidence;
  if (franchise.confidence) confidenceByField.franchise = franchise.confidence;
  if (set.confidence) confidenceByField.set = set.confidence;
  if (season.confidence) confidenceByField.season = season.confidence;
  if (productFormat.confidence) {
    confidenceByField.productFormat = productFormat.confidence;
  }
  if (colour.confidence) confidenceByField.colour = colour.confidence;
  confidenceByField.displayName =
    obs.overallConfidence === "LOW" ? "MEDIUM" : obs.overallConfidence;

  const uncertainImportant: string[] = [];
  for (const [key, level] of Object.entries(confidenceByField)) {
    if (level === "MEDIUM" || level === "LOW") {
      if (
        key === "model" ||
        key === "variant" ||
        key === "generation" ||
        key === "set" ||
        key === "productFormat"
      ) {
        uncertainImportant.push(key);
      }
    }
  }
  for (const u of obs.unknowns || []) {
    const t = String(u || "").trim().toLowerCase();
    if (!t) continue;
    if (/model|trim|variant|mileage|year|storage|size|subject|player/.test(t)) {
      uncertainImportant.push(t);
    }
  }

  return {
    domain: obs.domain || "unknown",
    objectType,
    brand: brand.value,
    productFamily: product.value,
    model: model.value,
    generation: generationCandidate.value,
    variant:
      generationCandidate.value && variant.value === generationCandidate.value
        ? null
        : variant.value,
    franchise: franchise.value,
    set: set.value,
    season: season.value,
    productFormat: productFormat.value,
    colour: colour.value,
    displayName: String(displayName).replace(/\s+/g, " ").trim(),
    visibleAttributes: [...(obs.visibleFeatures || []), ...(obs.visibleFacts || [])].slice(
      0,
      24
    ),
    visibleText: [...(obs.visibleText || []), ...(obs.identifiers || [])].slice(0, 24),
    confidenceByField,
    overallConfidence: obs.overallConfidence,
    uncertainImportant: [...new Set(uncertainImportant)].slice(0, 6),
    evidenceNotes: [
      ...(obs.readableFacts || []).slice(0, 6),
      ...(obs.uncertainties || []).slice(0, 4),
    ],
  };
}

/**
 * Merge evidence from a later photo of the SAME object.
 * Never downgrades a richer HIGH identity to a broad category.
 */
export function mergeCanonicalVisualIdentity(
  prior: CanonicalVisualIdentity,
  next: CanonicalVisualIdentity
): CanonicalVisualIdentity {
  const confidenceByField: CanonicalVisualIdentity["confidenceByField"] = {
    ...prior.confidenceByField,
  };
  for (const [key, level] of Object.entries(next.confidenceByField)) {
    const k = key as keyof typeof confidenceByField;
    confidenceByField[k] = preferHigherConfidence(confidenceByField[k], level);
  }

  const richerObjectType =
    prior.objectType === "unknown"
      ? next.objectType
      : next.objectType === "unknown"
        ? prior.objectType
        : // Prefer more specific sealed/product types over individual_card collapse
          next.objectType.includes("booster") ||
            next.objectType === "etb" ||
            next.objectType === "graded_card"
          ? next.objectType
          : prior.objectType;

  const displayName = (() => {
    const a = prior.displayName;
    const b = next.displayName;
    const aTokens = a.toLowerCase().split(/\s+/).filter(Boolean);
    const bTokens = b.toLowerCase().split(/\s+/).filter(Boolean);
    // Never replace a specific identity with a bare domain noun
    if (bTokens.length <= 1 && aTokens.length > 1) return a;
    if (aTokens.length <= 1 && bTokens.length > 1) return b;
    return b.length >= a.length ? b : a;
  })();

  return {
    domain: prior.domain !== "unknown" ? prior.domain : next.domain,
    objectType: richerObjectType,
    brand: pickRicher(prior.brand, next.brand),
    productFamily: pickRicher(prior.productFamily, next.productFamily),
    model: pickRicher(prior.model, next.model),
    generation: pickRicher(prior.generation, next.generation),
    variant: pickRicher(prior.variant, next.variant),
    franchise: pickRicher(prior.franchise, next.franchise),
    set: pickRicher(prior.set, next.set),
    season: pickRicher(prior.season, next.season),
    productFormat: pickRicher(prior.productFormat, next.productFormat),
    colour: pickRicher(prior.colour, next.colour),
    displayName,
    visibleAttributes: [
      ...new Set([...prior.visibleAttributes, ...next.visibleAttributes]),
    ].slice(0, 32),
    visibleText: [...new Set([...prior.visibleText, ...next.visibleText])].slice(0, 32),
    confidenceByField,
    overallConfidence:
      preferHigherConfidence(prior.overallConfidence, next.overallConfidence) ||
      next.overallConfidence,
    uncertainImportant: [
      ...new Set(
        [...prior.uncertainImportant, ...next.uncertainImportant].filter((key) => {
          const level =
            confidenceByField[key as keyof typeof confidenceByField] || "MEDIUM";
          return level !== "HIGH";
        })
      ),
    ].slice(0, 6),
    evidenceNotes: [
      ...new Set([...prior.evidenceNotes, ...next.evidenceNotes]),
    ].slice(0, 12),
  };
}

/** Map ontology object type → marketplace category when identity is authoritative. */
export function categoryFromCanonicalIdentity(
  identity: CanonicalVisualIdentity
): string | undefined {
  return categoryForAwhinaObjectType(identity.objectType);
}

/**
 * Persist identity as structured extras so title/desc/questions share one source.
 * Never serializes as Attr: dumps.
 */
export function canonicalIdentityToExtras(
  identity: CanonicalVisualIdentity,
  existing: string[] = []
): string[] {
  const extras = existing.filter(
    (entry) =>
      !/^(objectType|brand|productFamily|model|generation|variant|franchise|set|season|productFormat|manufacturer):/i.test(
        entry
      )
  );
  const push = (key: string, value: string | null) => {
    if (!value?.trim()) return;
    extras.push(`${key}:${value.trim()}`);
  };
  if (identity.objectType !== "unknown") {
    push("objectType", identity.objectType);
  }
  push("brand", identity.brand);
  if (identity.brand) push("manufacturer", identity.brand);
  push("productFamily", identity.productFamily);
  push("model", identity.model);
  push("generation", identity.generation);
  push("variant", identity.variant);
  push("franchise", identity.franchise);
  push("set", identity.set);
  push("season", identity.season);
  push("productFormat", identity.productFormat);
  return extras.slice(0, 40);
}

/**
 * Confidence-based conversation policy for /post/ai sell photos.
 * HIGH → proceed. MEDIUM → confirm the uncertain important part. LOW → one targeted ask.
 */
export function conversationPolicyFromIdentity(identity: CanonicalVisualIdentity): {
  mode: "proceed" | "confirm_uncertain" | "ask_targeted";
  prompt: string | null;
} {
  const uncertain = identity.uncertainImportant[0];
  const softCategoryOnly =
    identity.objectType === "unknown" ||
    (!identity.brand &&
      !identity.model &&
      !identity.productFamily &&
      /^(black|white|grey|gray|blue|red|game\s+console|console|phone|car|vehicle|item|this item)\b/i.test(
        identity.displayName
      ));

  if (softCategoryOnly || identity.overallConfidence === "LOW") {
    return {
      mode: "ask_targeted",
      prompt: identity.brand
        ? `I can tell it's a **${identity.brand}**, but I can't confidently identify the exact model. Which model is it?`
        : `I can see this is a **${identity.objectType !== "unknown" ? identity.objectType.replace(/_/g, " ") : identity.displayName}**, but I need the exact product name. What is it?`,
    };
  }

  if (identity.overallConfidence === "HIGH" && identity.uncertainImportant.length === 0) {
    return { mode: "proceed", prompt: null };
  }

  if (
    identity.overallConfidence === "HIGH" ||
    (identity.overallConfidence === "MEDIUM" &&
      Boolean(identity.brand || identity.model || identity.productFamily))
  ) {
    if (!uncertain) return { mode: "proceed", prompt: null };
    const label =
      uncertain === "model"
        ? "exact model"
        : uncertain === "generation"
          ? "generation"
          : uncertain === "variant"
            ? "variant/trim"
            : uncertain === "set"
              ? "set / product line"
              : uncertain;
    return {
      mode: "confirm_uncertain",
      prompt: `Looks like a **${identity.displayName}** — can you confirm the ${label}?`,
    };
  }

  return {
    mode: "ask_targeted",
    prompt: identity.brand
      ? `I can tell it's a **${identity.brand}**, but I can't confidently identify the exact model. Which model is it?`
      : `I can see this is a **${identity.objectType.replace(/_/g, " ")}**, but I need the exact product name. What is it?`,
  };
}
