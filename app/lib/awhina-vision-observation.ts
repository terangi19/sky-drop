/**
 * Structured vision observations for shared multimodal recognition.
 * Adapter input only - maps into existing StructuredListingFacts / SkyAiListingFill.
 */

import type { AwhinaConfidenceLevel } from "./awhina-confidence-levels";
import { normalizeConfidenceLevel } from "./awhina-confidence-levels";

export type VisionEvidenceKind =
  | "VISIBLE"
  | "READABLE"
  | "INFERRED"
  | "INFERENCE"
  | "USER_CONFIRMED"
  | "UNKNOWN";

export type VisionObservedField = {
  value: string;
  confidence: AwhinaConfidenceLevel;
  evidence: VisionEvidenceKind;
  note?: string;
};

export type VisionListingObservation = {
  domain: string;
  listingType: VisionObservedField;
  itemIdentity: VisionObservedField;
  brand: VisionObservedField;
  product: VisionObservedField;
  model: VisionObservedField;
  variant: VisionObservedField;
  category: VisionObservedField;
  colour: VisionObservedField;
  visibleCondition: VisionObservedField;
  /** Trading-card structured facts — empty when not a card / unreadable */
  cardSubject: VisionObservedField;
  cardSet: VisionObservedField;
  cardYear: VisionObservedField;
  /** Packaged collectible identity, kept separate from a single card. */
  productFormat: VisionObservedField;
  league: VisionObservedField;
  season: VisionObservedField;
  quantity: VisionObservedField;
  visibleText: string[];
  parallel: VisionObservedField;
  grader: VisionObservedField;
  grade: VisionObservedField;
  serialNumber: VisionObservedField;
  identifiers: string[];
  visibleFeatures: string[];
  accessories: string[];
  usefulFacts: string[];
  visibleFacts: string[];
  readableFacts: string[];
  inferredFacts: string[];
  unknowns: string[];
  uncertainties: string[];
  overallConfidence: AwhinaConfidenceLevel;
  displayIdentity: string;
  visualDescription: string;
};

export const VISION_LISTING_OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "domain",
    "listingType",
    "itemIdentity",
    "brand",
    "product",
    "model",
    "variant",
    "category",
    "colour",
    "visibleCondition",
    "cardSubject",
    "cardSet",
    "cardYear",
    "productFormat",
    "league",
    "season",
    "quantity",
    "visibleText",
    "parallel",
    "grader",
    "grade",
    "serialNumber",
    "identifiers",
    "visibleFeatures",
    "accessories",
    "usefulFacts",
    "visibleFacts",
    "readableFacts",
    "inferredFacts",
    "unknowns",
    "uncertainties",
    "overallConfidence",
    "displayIdentity",
    "visualDescription",
  ],
  properties: {
    domain: { type: "string" },
    listingType: { $ref: "#/$defs/observedField" },
    itemIdentity: { $ref: "#/$defs/observedField" },
    brand: { $ref: "#/$defs/observedField" },
    product: { $ref: "#/$defs/observedField" },
    model: { $ref: "#/$defs/observedField" },
    variant: { $ref: "#/$defs/observedField" },
    category: { $ref: "#/$defs/observedField" },
    colour: { $ref: "#/$defs/observedField" },
    visibleCondition: { $ref: "#/$defs/observedField" },
    cardSubject: { $ref: "#/$defs/observedField" },
    cardSet: { $ref: "#/$defs/observedField" },
    cardYear: { $ref: "#/$defs/observedField" },
    productFormat: { $ref: "#/$defs/observedField" },
    league: { $ref: "#/$defs/observedField" },
    season: { $ref: "#/$defs/observedField" },
    quantity: { $ref: "#/$defs/observedField" },
    visibleText: { type: "array", items: { type: "string" } },
    parallel: { $ref: "#/$defs/observedField" },
    grader: { $ref: "#/$defs/observedField" },
    grade: { $ref: "#/$defs/observedField" },
    serialNumber: { $ref: "#/$defs/observedField" },
    identifiers: { type: "array", items: { type: "string" } },
    visibleFeatures: { type: "array", items: { type: "string" } },
    accessories: { type: "array", items: { type: "string" } },
    usefulFacts: { type: "array", items: { type: "string" } },
    visibleFacts: { type: "array", items: { type: "string" } },
    readableFacts: { type: "array", items: { type: "string" } },
    inferredFacts: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    uncertainties: { type: "array", items: { type: "string" } },
    overallConfidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
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
          enum: ["VISIBLE", "READABLE", "INFERRED", "UNKNOWN"],
        },
        note: { type: "string" },
      },
    },
  },
} as const;

export const VISION_LISTING_SYSTEM = `You are Awhina's shared multimodal recognition adapter for Sky Drop (NZ marketplace).

Analyze ALL product photos together as ONE listing. Deduplicate. Return ONE structured observation.

Domain: gaming | phones | vehicles | fashion | electronics | tools | trading-cards | collectibles | home | unknown

Evidence on fields: VISIBLE | READABLE | INFERRED | UNKNOWN
Fact buckets: visibleFacts, readableFacts, inferredFacts, unknowns

HARD RULES - never invent price, location, ownership, warranty, authenticity, works/powers-on,
storage/battery/mileage unless READABLE, exact year unless READABLE.
Never invent unreadable player/character names, set names, or serial numbers.
Never copy a prior conversation brand — identify ONLY what is in THESE photos.

READ DEEPLY (critical for packaging, trading cards / labels / electronics):
- Logos and manufacturer marks (Topps, Panini, Nike, Apple, etc.)
- Printed player/character names, team names, product line (Chrome, Prizm, …)
- Serial fractions (e.g. 14/25), card numbers, parallel/refractor colour cues
- Graders and grades on slabs (PSA/BGS/CGC) when readable
- Packaging format: distinguish an individual card, graded card, pack, booster pack, multipack, booster box, hobby box, blaster box, mega box, starter pack, tin, sealed set, or loose bundle. The object photographed is the listing — a sealed box is NOT an individual card inside it.
- For packaged collectibles, capture clearly readable brand, product line, league/franchise, season/year, productFormat, quantity and visibleText. Leave any unreadable value empty; never guess Chrome, a season, hobby vs retail, or pack count.
- Put shallow visual noise (orange background, shiny surface, player image) in visibleFeatures ONLY — never as identity.

IDENTITY vs ATTRIBUTES (critical):
- itemIdentity / displayIdentity must name the OBJECT (player/character + card type, phone model, shoe model, car make+model).
- NEVER set displayIdentity to attribute stacks alone: grader+grade+brand (e.g. "PSA 10 Panini"), brand+size, brand+storage, make+transmission.
- NEVER set displayIdentity to a lone manufacturer (e.g. "Panini" or "Topps") when richer readable facts exist.
- Trading cards: put player/character in cardSubject when READABLE; brand/publisher in brand; product line in cardSet or product; grader/grade/serial/parallel/year in their fields.
- Sealed trading-card products: use itemIdentity/displayIdentity such as "Topps Premier League booster box" when the packaging supports it. Keep productFormat separate and use trading-card product / sealed product semantics, not "trading card".
- If player/character is unreadable: leave cardSubject empty, put "player name" in unknowns, and set displayIdentity to a soft category like "Topps Chrome football card" or "graded football card" — NOT "Panini" alone.
- Phones: model in product/model; storage is NOT identity.
- Shoes: model/line is identity; size is attribute.
- Vehicles: make+model is identity; transmission/colour are attributes.

Condition: VISIBLE wear only. Do NOT map uncertain / looks-clean / shiny to New or Like New. New only for sealed/unopened packaging evidence.
listingType: physical | vehicle | digital | service | rental
category: Tech, Gaming, Home, Fashion, Sports, Cars, Other
(Use Sports for trading cards / sports collectibles — there is no Collectibles form category.)
displayIdentity: short human label that actually identifies the item (e.g. PlayStation 5). Empty-ish category OK if unsure.
visualDescription: 1-2 natural sentences of safe visible facts - no marketing. PERCEPTION ONLY — never write marketplace listing copy.

Multi-photo = ONE listing (same object). If photos clearly show different items, note that in uncertainties.`;

export function emptyObservedField(
  confidence: AwhinaConfidenceLevel = "LOW"
): VisionObservedField {
  return { value: "", confidence, evidence: "UNKNOWN", note: "" };
}

export function emptyVisionObservation(): VisionListingObservation {
  return {
    domain: "unknown",
    listingType: emptyObservedField(),
    itemIdentity: emptyObservedField(),
    brand: emptyObservedField(),
    product: emptyObservedField(),
    model: emptyObservedField(),
    variant: emptyObservedField(),
    category: emptyObservedField(),
    colour: emptyObservedField(),
    visibleCondition: emptyObservedField(),
    cardSubject: emptyObservedField(),
    cardSet: emptyObservedField(),
    cardYear: emptyObservedField(),
    productFormat: emptyObservedField(),
    league: emptyObservedField(),
    season: emptyObservedField(),
    quantity: emptyObservedField(),
    visibleText: [],
    parallel: emptyObservedField(),
    grader: emptyObservedField(),
    grade: emptyObservedField(),
    serialNumber: emptyObservedField(),
    identifiers: [],
    visibleFeatures: [],
    accessories: [],
    usefulFacts: [],
    visibleFacts: [],
    readableFacts: [],
    inferredFacts: [],
    unknowns: [],
    uncertainties: [],
    overallConfidence: "LOW",
    displayIdentity: "",
    visualDescription: "",
  };
}

function normalizeEvidence(raw: string): VisionEvidenceKind {
  const s = raw.toUpperCase();
  if (s === "VISIBLE") return "VISIBLE";
  if (s === "READABLE") return "READABLE";
  if (s === "INFERRED" || s === "INFERENCE") return "INFERRED";
  if (s === "USER_CONFIRMED" || s === "USER") return "USER_CONFIRMED";
  return "UNKNOWN";
}

function parseObservedField(raw: unknown): VisionObservedField {
  if (!raw || typeof raw !== "object") return emptyObservedField();
  const o = raw as Record<string, unknown>;
  return {
    value: typeof o.value === "string" ? o.value.trim() : "",
    confidence: normalizeConfidenceLevel(String(o.confidence || "LOW")),
    evidence: normalizeEvidence(String(o.evidence || "UNKNOWN")),
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
  const visibleFeatures = parseStringArray(o.visibleFeatures);
  const visibleFacts = parseStringArray(o.visibleFacts);
  return {
    domain: typeof o.domain === "string" && o.domain.trim() ? o.domain.trim() : "unknown",
    listingType: parseObservedField(o.listingType),
    itemIdentity: parseObservedField(o.itemIdentity),
    brand: parseObservedField(o.brand),
    product: parseObservedField(o.product),
    model: parseObservedField(o.model),
    variant: parseObservedField(o.variant),
    category: parseObservedField(o.category),
    colour: parseObservedField(o.colour),
    visibleCondition: parseObservedField(o.visibleCondition),
    cardSubject: parseObservedField(o.cardSubject),
    cardSet: parseObservedField(o.cardSet),
    cardYear: parseObservedField(o.cardYear),
    productFormat: parseObservedField(o.productFormat),
    league: parseObservedField(o.league),
    season: parseObservedField(o.season),
    quantity: parseObservedField(o.quantity),
    visibleText: parseStringArray(o.visibleText),
    parallel: parseObservedField(o.parallel),
    grader: parseObservedField(o.grader),
    grade: parseObservedField(o.grade),
    serialNumber: parseObservedField(o.serialNumber),
    identifiers: parseStringArray(o.identifiers),
    visibleFeatures,
    accessories: parseStringArray(o.accessories),
    usefulFacts: parseStringArray(o.usefulFacts),
    visibleFacts: visibleFacts.length ? visibleFacts : visibleFeatures,
    readableFacts: parseStringArray(o.readableFacts),
    inferredFacts: parseStringArray(o.inferredFacts),
    unknowns: parseStringArray(o.unknowns, 12),
    uncertainties: parseStringArray(o.uncertainties, 8),
    overallConfidence: normalizeConfidenceLevel(String(o.overallConfidence || "LOW")),
    displayIdentity: typeof o.displayIdentity === "string" ? o.displayIdentity.trim() : "",
    visualDescription:
      typeof o.visualDescription === "string"
        ? o.visualDescription.trim().slice(0, 600)
        : "",
  };
}

/** HIGH+VISIBLE/READABLE/USER_CONFIRMED populate; MEDIUM optional; LOW/INFERRED never. */
export function mayPopulateFromVision(
  field: VisionObservedField,
  opts?: { allowMedium?: boolean }
): boolean {
  if (!field.value.trim()) return false;
  if (
    field.evidence === "UNKNOWN" ||
    field.evidence === "INFERRED" ||
    field.evidence === "INFERENCE"
  ) {
    return false;
  }
  if (field.confidence === "LOW") return false;
  if (field.evidence === "USER_CONFIRMED") return true;
  if (field.confidence === "HIGH") return true;
  return opts?.allowMedium === true;
}

export function mapVisibleConditionToListing(
  field: VisionObservedField
): string | undefined {
  if (!mayPopulateFromVision(field)) return undefined;
  const lower = field.value.toLowerCase();
  if (
    field.confidence === "HIGH" &&
    (/\b(sealed|unopened|factory\s*sealed|brand\s*new\s*in\s*box)\b/.test(lower) ||
      (/\bnew\b/.test(lower) && /\b(box|packaging|sealed)\b/.test(lower)))
  ) {
    return "New";
  }
  if (/\b(heavy\s*wear|damaged|cracked|broken|dent|deep\s*scratch)/.test(lower)) {
    return "Used - Fair";
  }
  if (/\b(scuff|scratch|wear|used|open\s*box|opened)\b/.test(lower)) {
    return "Used - Good";
  }
  return undefined;
}
