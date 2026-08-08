/**
 * Structured vision observations for camera-first listing.
 * Adapter input only — maps into existing StructuredListingFacts / SkyAiListingFill.
 * Never invents storage, battery, mileage, warranty, authenticity, ownership, exact year
 * unless READABLE or seller-supplied.
 */

import type { AwhinaConfidenceLevel } from "./awhina-confidence-levels";
import { normalizeConfidenceLevel } from "./awhina-confidence-levels";

/** How the model knows a fact. */
export type VisionEvidenceKind = "VISIBLE" | "READABLE" | "INFERENCE" | "UNKNOWN";

export type VisionObservedField = {
  value: string;
  confidence: AwhinaConfidenceLevel;
  evidence: VisionEvidenceKind;
  /** Short note e.g. "logo on console front" */
  note?: string;
};

export type VisionListingObservation = {
  listingType: VisionObservedField;
  itemIdentity: VisionObservedField;
  brand: VisionObservedField;
  product: VisionObservedField;
  model: VisionObservedField;
  variant: VisionObservedField;
  category: VisionObservedField;
  colour: VisionObservedField;
  visibleCondition: VisionObservedField;
  identifiers: string[];
  visibleFeatures: string[];
  accessories: string[];
  usefulFacts: string[];
  uncertainties: string[];
  overallConfidence: AwhinaConfidenceLevel;
  /** One-line human identity for "Āwhina found it" */
  displayIdentity: string;
  /** Safe visual description fragment (no marketing fluff) */
  visualDescription: string;
};

/** Strict JSON Schema for Responses API Structured Outputs. */
export const VISION_LISTING_OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "listingType",
    "itemIdentity",
    "brand",
    "product",
    "model",
    "variant",
    "category",
    "colour",
    "visibleCondition",
    "identifiers",
    "visibleFeatures",
    "accessories",
    "usefulFacts",
    "uncertainties",
    "overallConfidence",
    "displayIdentity",
    "visualDescription",
  ],
  properties: {
    listingType: { $ref: "#/$defs/observedField" },
    itemIdentity: { $ref: "#/$defs/observedField" },
    brand: { $ref: "#/$defs/observedField" },
    product: { $ref: "#/$defs/observedField" },
    model: { $ref: "#/$defs/observedField" },
    variant: { $ref: "#/$defs/observedField" },
    category: { $ref: "#/$defs/observedField" },
    colour: { $ref: "#/$defs/observedField" },
    visibleCondition: { $ref: "#/$defs/observedField" },
    identifiers: {
      type: "array",
      items: { type: "string" },
    },
    visibleFeatures: {
      type: "array",
      items: { type: "string" },
    },
    accessories: {
      type: "array",
      items: { type: "string" },
    },
    usefulFacts: {
      type: "array",
      items: { type: "string" },
    },
    uncertainties: {
      type: "array",
      items: { type: "string" },
    },
    overallConfidence: {
      type: "string",
      enum: ["HIGH", "MEDIUM", "LOW"],
    },
    displayIdentity: { type: "string" },
    visualDescription: { type: "string" },
  },
  $defs: {
    observedField: {
      type: "object",
      additionalProperties: false,
      required: ["value", "confidence", "evidence", "note"],
      properties: {
        value: { type: "string" },
        confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        evidence: {
          type: "string",
          enum: ["VISIBLE", "READABLE", "INFERENCE", "UNKNOWN"],
        },
        note: { type: "string" },
      },
    },
  },
} as const;

export const VISION_LISTING_SYSTEM = `You are Āwhina's vision INPUT ADAPTER for Sky Drop (NZ marketplace).

Analyze ALL product photos together as ONE listing. Deduplicate. Return ONE structured observation.

Evidence kinds:
- VISIBLE: clearly seen in photo(s)
- READABLE: text/logo/label readable on item or packaging
- INFERENCE: educated guess (prefer LOW confidence)
- UNKNOWN: not supported — leave value empty string

HARD RULES — never invent:
- Price, location, ownership, warranty, authenticity, "works"/powers on
- Storage capacity, battery health, mileage/odometer unless READABLE on screen/label
- Exact model year unless READABLE on badge/registration/packaging
- Invisible defects, box contents not shown, accessories not in photos

Condition: describe VISIBLE wear only (scuffs, box open, sealed). Do NOT map uncertain → "Like New".
If condition is unclear, set visibleCondition.value="" with evidence UNKNOWN and confidence LOW.

listingType: physical | vehicle | digital | service | rental (default physical for tangible goods).
category: Tech, Gaming, Home, Fashion, Sports, Cars, Other when unsure.
displayIdentity: short human label e.g. "PlayStation 5" or "Nike Air Force 1".
visualDescription: 1–2 natural sentences of safe visible facts only — no marketing.

Multi-photo: one listing, not one per photo. Prefer MEDIUM/LOW + uncertainties when photos conflict.`;

export function emptyObservedField(
  confidence: AwhinaConfidenceLevel = "LOW"
): VisionObservedField {
  return { value: "", confidence, evidence: "UNKNOWN", note: "" };
}

export function emptyVisionObservation(): VisionListingObservation {
  return {
    listingType: emptyObservedField(),
    itemIdentity: emptyObservedField(),
    brand: emptyObservedField(),
    product: emptyObservedField(),
    model: emptyObservedField(),
    variant: emptyObservedField(),
    category: emptyObservedField(),
    colour: emptyObservedField(),
    visibleCondition: emptyObservedField(),
    identifiers: [],
    visibleFeatures: [],
    accessories: [],
    usefulFacts: [],
    uncertainties: [],
    overallConfidence: "LOW",
    displayIdentity: "",
    visualDescription: "",
  };
}

function parseObservedField(raw: unknown): VisionObservedField {
  if (!raw || typeof raw !== "object") return emptyObservedField();
  const o = raw as Record<string, unknown>;
  const evidenceRaw = String(o.evidence || "UNKNOWN").toUpperCase();
  const evidence: VisionEvidenceKind =
    evidenceRaw === "VISIBLE" ||
    evidenceRaw === "READABLE" ||
    evidenceRaw === "INFERENCE" ||
    evidenceRaw === "UNKNOWN"
      ? evidenceRaw
      : "UNKNOWN";
  return {
    value: typeof o.value === "string" ? o.value.trim() : "",
    confidence: normalizeConfidenceLevel(String(o.confidence || "LOW")),
    evidence,
    note: typeof o.note === "string" ? o.note.trim().slice(0, 120) : "",
  };
}

function parseStringArray(raw: unknown, max = 16): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

export function parseVisionObservation(raw: unknown): VisionListingObservation {
  if (!raw || typeof raw !== "object") return emptyVisionObservation();
  const o = raw as Record<string, unknown>;
  return {
    listingType: parseObservedField(o.listingType),
    itemIdentity: parseObservedField(o.itemIdentity),
    brand: parseObservedField(o.brand),
    product: parseObservedField(o.product),
    model: parseObservedField(o.model),
    variant: parseObservedField(o.variant),
    category: parseObservedField(o.category),
    colour: parseObservedField(o.colour),
    visibleCondition: parseObservedField(o.visibleCondition),
    identifiers: parseStringArray(o.identifiers),
    visibleFeatures: parseStringArray(o.visibleFeatures),
    accessories: parseStringArray(o.accessories),
    usefulFacts: parseStringArray(o.usefulFacts),
    uncertainties: parseStringArray(o.uncertainties, 8),
    overallConfidence: normalizeConfidenceLevel(
      String(o.overallConfidence || "LOW")
    ),
    displayIdentity:
      typeof o.displayIdentity === "string" ? o.displayIdentity.trim() : "",
    visualDescription:
      typeof o.visualDescription === "string"
        ? o.visualDescription.trim().slice(0, 600)
        : "",
  };
}

/**
 * Confidence policy for population:
 * HIGH + (VISIBLE|READABLE) → may populate
 * MEDIUM → suggest / ask confirmation (populate only identity-safe fields when confirmed)
 * LOW / INFERENCE / UNKNOWN → do not populate
 */
export function mayPopulateFromVision(
  field: VisionObservedField,
  opts?: { allowMedium?: boolean }
): boolean {
  if (!field.value.trim()) return false;
  if (field.evidence === "UNKNOWN" || field.evidence === "INFERENCE") return false;
  if (field.confidence === "LOW") return false;
  if (field.confidence === "HIGH") return true;
  return opts?.allowMedium === true;
}

/** Condition: never auto-map uncertain VISIBLE clues to Like New. */
export function mapVisibleConditionToListing(
  field: VisionObservedField
): string | undefined {
  if (!mayPopulateFromVision(field)) return undefined;
  const lower = field.value.toLowerCase();
  // Explicit sealed/new packaging only
  if (
    field.confidence === "HIGH" &&
    (/\b(sealed|unopened|factory\s*sealed|brand\s*new\s*in\s*box)\b/.test(lower) ||
      /\bnew\b/.test(lower) && /\b(box|packaging|sealed)\b/.test(lower))
  ) {
    return "New";
  }
  if (/\b(heavy\s*wear|damaged|cracked|broken|dent|deep\s*scratch)/.test(lower)) {
    return "Used - Fair";
  }
  if (/\b(scuff|scratch|wear|used|open\s*box|opened)\b/.test(lower)) {
    return "Used - Good";
  }
  // Ambiguous "good"/"like new" from vision alone — do not set
  return undefined;
}
