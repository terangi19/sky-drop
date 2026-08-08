/**
 * Universal structured listing facts — vision + text + knowledge merge.
 * Provenance: USER > IMAGE > LOCAL_DATA > LOOKUP > MODEL_INFERENCE
 * Vision proposes; canonical validation decides. Never invent high-risk facts.
 */

import type { KnowledgeProvenance } from "./marketplace-knowledge/types";
import { mayOverwrite, PROVENANCE_RANK } from "./marketplace-knowledge/provenance";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { AwhinaConfidenceLevel } from "./awhina-confidence-levels";

export type FactProvenance = KnowledgeProvenance | "IMAGE";

export type ListingFactField =
  | "listingType"
  | "category"
  | "itemIdentity"
  | "brand"
  | "model"
  | "variant"
  | "condition"
  | "conditionClues"
  | "price"
  | "location"
  | "title"
  | "description"
  | "vehicleYear"
  | "vehicleOdometer"
  | "vehicleMake"
  | "vehicleModel"
  | "vehicleTransmission"
  | "vehicleFuelType"
  | "vehicleColour"
  | "storage"
  | "size"
  | "cardSet"
  | "cardSubject"
  | "gradeCompany"
  | "gradeValue"
  | "colour"
  | "rentalSubType"
  | "servicePricingType";

export type ListingFactValue = {
  value: string;
  provenance: FactProvenance;
  confidence: AwhinaConfidenceLevel;
  /** Source image index(es) when from vision */
  imageIndexes?: number[];
};

export type StructuredListingFacts = {
  fields: Partial<Record<ListingFactField, ListingFactValue>>;
  visibleAttributes: string[];
  textFound: string[];
  identifiers: string[];
  /** Domain extras not yet first-class */
  domainExtras: string[];
  /** Locked identity key once high-confidence */
  entityLockKey?: string;
  entityLocked?: boolean;
};

/** High-risk — never invent from IMAGE/MODEL alone. */
export const HALLUCINATION_RISK_FIELDS = new Set<ListingFactField | string>([
  "price",
  "gradeValue",
  "authenticity",
  "mechanicalCondition",
  "batteryHealth",
  "warranty",
  "works",
  "population",
  "marketValue",
]);

const FACT_PROVENANCE_RANK: Record<FactProvenance, number> = {
  ...PROVENANCE_RANK,
  IMAGE: 85,
};

export function mayOverwriteFact(
  existing: FactProvenance | undefined,
  incoming: FactProvenance
): boolean {
  if (!existing) return true;
  return FACT_PROVENANCE_RANK[incoming] >= FACT_PROVENANCE_RANK[existing];
}

export function emptyListingFacts(): StructuredListingFacts {
  return {
    fields: {},
    visibleAttributes: [],
    textFound: [],
    identifiers: [],
    domainExtras: [],
  };
}

/** Merge one fact — higher provenance wins; USER always beats IMAGE. */
export function setFact(
  bag: StructuredListingFacts,
  field: ListingFactField,
  value: string,
  provenance: FactProvenance,
  confidence: AwhinaConfidenceLevel,
  opts?: { imageIndexes?: number[]; force?: boolean }
): boolean {
  const v = value.trim();
  if (!v) return false;
  if (
    HALLUCINATION_RISK_FIELDS.has(field) &&
    (provenance === "IMAGE" || provenance === "MODEL_INFERENCE") &&
    !opts?.force
  ) {
    return false;
  }
  const cur = bag.fields[field];
  if (cur && !opts?.force && !mayOverwriteFact(cur.provenance, provenance)) {
    return false;
  }
  // Same provenance: prefer higher confidence
  if (cur && cur.provenance === provenance && !opts?.force) {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    if ((rank[confidence] || 0) < (rank[cur.confidence] || 0)) return false;
  }
  bag.fields[field] = {
    value: v,
    provenance,
    confidence,
    imageIndexes: opts?.imageIndexes,
  };
  return true;
}

/** Merge bags — per-field provenance wins. */
export function mergeListingFacts(
  base: StructuredListingFacts,
  incoming: StructuredListingFacts
): StructuredListingFacts {
  const out: StructuredListingFacts = {
    fields: { ...base.fields },
    visibleAttributes: [...base.visibleAttributes],
    textFound: [...base.textFound],
    identifiers: [...base.identifiers],
    domainExtras: [...base.domainExtras],
    entityLockKey: base.entityLockKey,
    entityLocked: base.entityLocked,
  };
  for (const [k, fact] of Object.entries(incoming.fields) as [
    ListingFactField,
    ListingFactValue,
  ][]) {
    if (!fact) continue;
    setFact(out, k, fact.value, fact.provenance, fact.confidence, {
      imageIndexes: fact.imageIndexes,
    });
  }
  const uniq = (arr: string[]) =>
    [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, 24);
  out.visibleAttributes = uniq([
    ...out.visibleAttributes,
    ...incoming.visibleAttributes,
  ]);
  out.textFound = uniq([...out.textFound, ...incoming.textFound]);
  out.identifiers = uniq([...out.identifiers, ...incoming.identifiers]);
  out.domainExtras = uniq([...out.domainExtras, ...incoming.domainExtras]);

  // Entity lock: once locked, only USER can change identity fields
  if (base.entityLocked && base.entityLockKey) {
    out.entityLocked = true;
    out.entityLockKey = base.entityLockKey;
    for (const idField of [
      "itemIdentity",
      "brand",
      "model",
      "variant",
      "vehicleMake",
      "vehicleModel",
    ] as ListingFactField[]) {
      const f = out.fields[idField];
      const prior = base.fields[idField];
      if (
        f &&
        prior &&
        f.value.toLowerCase() !== prior.value.toLowerCase() &&
        f.provenance !== "USER"
      ) {
        out.fields[idField] = prior;
      }
    }
  } else if (incoming.entityLocked && incoming.entityLockKey) {
    out.entityLocked = true;
    out.entityLockKey = incoming.entityLockKey;
  }

  return out;
}

/** Lock identity when brand+model or itemIdentity is HIGH from USER/IMAGE/LOCAL. */
export function maybeLockEntity(bag: StructuredListingFacts): StructuredListingFacts {
  if (bag.entityLocked) return bag;
  const identity = bag.fields.itemIdentity;
  const brand = bag.fields.brand;
  const model = bag.fields.model;
  const make = bag.fields.vehicleMake;
  const vModel = bag.fields.vehicleModel;

  let key = "";
  let conf: AwhinaConfidenceLevel | undefined;
  let prov: FactProvenance | undefined;

  if (identity && identity.confidence === "HIGH") {
    key = identity.value.toLowerCase();
    conf = identity.confidence;
    prov = identity.provenance;
  } else if (
    ((brand && model) || (make && vModel)) &&
    (brand?.confidence === "HIGH" || make?.confidence === "HIGH") &&
    (model?.confidence === "HIGH" ||
      model?.confidence === "MEDIUM" ||
      vModel?.confidence === "HIGH" ||
      vModel?.confidence === "MEDIUM")
  ) {
    key = [brand?.value || make?.value, model?.value || vModel?.value]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    conf = "HIGH";
    prov = brand?.provenance || make?.provenance;
  }

  if (
    key &&
    conf === "HIGH" &&
    prov &&
    (prov === "USER" || prov === "IMAGE" || prov === "LOCAL_DATA")
  ) {
    return { ...bag, entityLocked: true, entityLockKey: key };
  }
  return bag;
}

/** Explicit user correction unlocks identity. */
export function unlockEntityForCorrection(
  bag: StructuredListingFacts
): StructuredListingFacts {
  return { ...bag, entityLocked: false, entityLockKey: undefined };
}

const CONDITION_MAP: Record<string, string> = {
  new: "New",
  sealed: "New",
  unopened: "New",
  "like new": "Used - Like New",
  mint: "Used - Like New",
  good: "Used - Good",
  used: "Used - Good",
  fair: "Used - Fair",
  scuffed: "Used - Fair",
};

function mapCondition(clues: string): string | undefined {
  const lower = clues.toLowerCase();
  for (const [k, v] of Object.entries(CONDITION_MAP)) {
    if (lower.includes(k)) return v;
  }
  return undefined;
}

/** Convert facts bag → SkyAiListingFill (never sets price/location from IMAGE). */
export function factsToListingFill(
  facts: StructuredListingFacts,
  opts?: { descriptionSource?: "ai" | "user"; preserveUserDescription?: string }
): SkyAiListingFill {
  const f = facts.fields;
  const fill: SkyAiListingFill = {};
  const g = (key: ListingFactField) => f[key]?.value;

  if (g("title")) fill.title = g("title");
  else {
    const parts = [
      g("brand") || g("vehicleMake"),
      g("model") || g("vehicleModel"),
      g("variant"),
      g("vehicleYear"),
    ].filter(Boolean);
    if (parts.length) fill.title = parts.join(" ");
    else if (g("itemIdentity")) fill.title = g("itemIdentity");
  }

  if (g("listingType")) fill.listingType = g("listingType");
  if (g("category")) fill.category = g("category");
  if (g("condition")) fill.condition = g("condition");
  else if (g("conditionClues")) {
    const mapped = mapCondition(g("conditionClues")!);
    if (mapped) fill.condition = mapped;
  }

  // Price/location only from USER
  if (f.price?.provenance === "USER") fill.price = f.price.value;
  if (f.location?.provenance === "USER") fill.location = f.location.value;

  if (opts?.preserveUserDescription) {
    fill.description = opts.preserveUserDescription;
  } else if (g("description") && f.description?.provenance === "USER") {
    fill.description = g("description");
  } else if (g("description") && opts?.descriptionSource !== "user") {
    fill.description = g("description");
  }

  if (g("vehicleMake")) fill.vehicleMake = g("vehicleMake");
  if (g("vehicleModel")) fill.vehicleModel = g("vehicleModel");
  if (g("vehicleYear") && f.vehicleYear?.provenance === "USER") {
    fill.vehicleYear = g("vehicleYear");
  } else if (g("vehicleYear") && f.vehicleYear?.confidence !== "LOW") {
    // Year from IMAGE only when visually supported (confidence already gated)
    fill.vehicleYear = g("vehicleYear");
  }
  if (g("vehicleOdometer") && f.vehicleOdometer?.provenance === "USER") {
    fill.vehicleOdometer = g("vehicleOdometer");
  }
  if (g("vehicleTransmission")) fill.vehicleTransmission = g("vehicleTransmission");
  if (g("vehicleFuelType")) fill.vehicleFuelType = g("vehicleFuelType");
  if (g("vehicleColour") || g("colour")) {
    fill.vehicleColour = g("vehicleColour") || g("colour");
  }
  if (g("rentalSubType")) fill.rentalSubType = g("rentalSubType");
  if (g("servicePricingType")) fill.servicePricingType = g("servicePricingType");

  const extras: string[] = [...facts.domainExtras];
  if (g("storage")) extras.push(`storage:${g("storage")}`);
  if (g("size")) extras.push(`size:${g("size")}`);
  if (g("cardSet")) extras.push(`set:${g("cardSet")}`);
  if (g("cardSubject")) extras.push(`subject:${g("cardSubject")}`);
  if (g("gradeCompany") && g("gradeValue")) {
    // Grade only when slab text was found (identifiers / textFound)
    const slabVisible =
      facts.textFound.some((t) => /psa|bgs|cgc|sgc/i.test(t)) ||
      facts.identifiers.some((t) => /psa|bgs|cgc/i.test(t)) ||
      f.gradeCompany?.provenance === "USER" ||
      f.gradeCompany?.provenance === "IMAGE";
    if (slabVisible) {
      extras.push(`grade:${g("gradeCompany")} ${g("gradeValue")}`);
    }
  }
  if (g("conditionClues")) extras.push(`Visual: ${g("conditionClues")}`);
  for (const a of facts.visibleAttributes) extras.push(`attr:${a}`);
  for (const t of facts.textFound.slice(0, 6)) extras.push(`text:${t}`);
  if (extras.length) fill.extras = [...new Set(extras)].slice(0, 24);

  return fill;
}

/** Apply USER message facts onto bag (explicit always wins). */
export function applyUserTextFacts(
  bag: StructuredListingFacts,
  partial: Partial<Record<ListingFactField, string>>,
  confidence: AwhinaConfidenceLevel = "HIGH"
): StructuredListingFacts {
  const out = mergeListingFacts(bag, emptyListingFacts());
  for (const [k, v] of Object.entries(partial) as [ListingFactField, string][]) {
    if (v) setFact(out, k, v, "USER", confidence, { force: true });
  }
  return maybeLockEntity(out);
}

export { mayOverwrite as mayOverwriteKnowledge };