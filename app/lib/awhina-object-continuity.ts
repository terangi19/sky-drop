/**
 * Photo object continuity — NEW photo is independent perception first.
 * SAME_OBJECT may merge USER locks; NEW_OBJECT must not inherit prior item brand/price/condition.
 */

import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { VisionListingObservation } from "./awhina-vision-observation";

export type ObjectContinuityVerdict = "SAME_OBJECT" | "NEW_OBJECT" | "UNKNOWN";

export type ObjectContinuityResult = {
  verdict: ObjectContinuityVerdict;
  reason: string;
  /** Prior draft fields that must NOT bleed into the new perception fill */
  blockedPriorFields: string[];
};

const MANUFACTURER_ONLY =
  /^(panini|topps|upper\s*deck|fleer|bowman|donruss|pokemon|nike|adidas|apple|samsung|sony|microsoft|bmw|toyota|ford|honda)$/i;

const ITEM_SCOPED_FIELDS = [
  "title",
  "description",
  "category",
  "condition",
  "price",
  "listingType",
  "vehicleMake",
  "vehicleModel",
  "vehicleGeneration",
  "vehicleYear",
  "vehicleColour",
  "vehicleOdometer",
  "vehicleTransmission",
  "vehicleFuelType",
  "vehicleBodyType",
  "extras",
] as const;

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAliases(s: string): string {
  return norm(s)
    .replace(/\bps5\b/g, "playstation 5")
    .replace(/\bps4\b/g, "playstation 4")
    .replace(/\biphone\b/g, "iphone apple")
    .replace(/\baf1\b/g, "air force");
}

function tokens(s: string): Set<string> {
  return new Set(
    expandAliases(s)
      .split(" ")
      .filter((t) => t.length >= 2 && !/^(the|and|for|with|new|used|card|my|custom|bundle)$/i.test(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
}

function priorIdentityBlob(prior: SkyAiListingContext | SkyAiListingFill | null | undefined): string {
  if (!prior) return "";
  const extras = Array.isArray(prior.extras) ? prior.extras.join(" ") : "";
  return [
    prior.title,
    prior.category,
    prior.listingType,
    prior.vehicleMake,
    prior.vehicleModel,
    extras,
  ]
    .filter(Boolean)
    .join(" ");
}

function visionIdentityBlob(obs: VisionListingObservation): string {
  return [
    obs.displayIdentity,
    obs.itemIdentity?.value,
    obs.brand?.value,
    obs.product?.value,
    obs.model?.value,
    obs.cardSubject?.value,
    obs.cardSet?.value,
    obs.domain,
    obs.category?.value,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Decide whether a new photo observation is the same listing object as the active draft.
 * Conservative: weak overlap → NEW_OBJECT so stale brands/prices cannot leak.
 */
export function assessObjectContinuity(opts: {
  observation: VisionListingObservation;
  priorDraft?: SkyAiListingContext | SkyAiListingFill | null;
}): ObjectContinuityResult {
  const prior = opts.priorDraft;
  const priorBlob = priorIdentityBlob(prior);
  if (!prior || !priorBlob.trim()) {
    return { verdict: "UNKNOWN", reason: "no_prior_draft", blockedPriorFields: [] };
  }

  const visionBlob = visionIdentityBlob(opts.observation);
  const priorTok = tokens(priorBlob);
  const visionTok = tokens(visionBlob);
  const overlap = jaccard(priorTok, visionTok);

  const priorBrand = norm(
    String(
      (prior as SkyAiListingFill).vehicleMake ||
        prior.title ||
        ""
    )
  );
  const visionBrand = norm(opts.observation.brand?.value || "");
  const priorTitle = norm(String(prior.title || ""));
  const visionId = norm(
    opts.observation.displayIdentity || opts.observation.itemIdentity?.value || ""
  );

  // Lone manufacturer title vs richer new identity → always NEW_OBJECT
  if (
    MANUFACTURER_ONLY.test(priorTitle) &&
    visionId &&
    !MANUFACTURER_ONLY.test(visionId) &&
    !visionId.includes(priorTitle)
  ) {
    return {
      verdict: "NEW_OBJECT",
      reason: "prior_manufacturer_only_vs_richer_vision",
      blockedPriorFields: [...ITEM_SCOPED_FIELDS],
    };
  }

  // Explicit brand mismatch (Panini → Topps)
  if (
    visionBrand &&
    priorTitle &&
    MANUFACTURER_ONLY.test(priorTitle) &&
    visionBrand !== priorTitle &&
    !visionBrand.includes(priorTitle) &&
    !priorTitle.includes(visionBrand)
  ) {
    return {
      verdict: "NEW_OBJECT",
      reason: "brand_mismatch",
      blockedPriorFields: [...ITEM_SCOPED_FIELDS],
    };
  }

  // Domain shift signals: card ↔ phone ↔ vehicle ↔ console
  const priorIsCard =
    /card|psa|panini|topps|collect/i.test(priorBlob) ||
    String(prior.category || "").toLowerCase() === "collectibles";
  const visionIsCard = /trading-?card|collectible/i.test(opts.observation.domain || "") ||
    Boolean(opts.observation.cardSubject?.value || opts.observation.cardSet?.value);
  const priorIsVehicle =
    String(prior.listingType || "").toLowerCase() === "vehicle" ||
    Boolean((prior as SkyAiListingFill).vehicleMake);
  const visionIsVehicle = /vehicle/i.test(opts.observation.domain || "") ||
    String(opts.observation.listingType?.value || "").toLowerCase() === "vehicle";
  const priorIsPhone = /iphone|galaxy|pixel|phone/i.test(priorBlob);
  const visionIsPhone = /phone/i.test(opts.observation.domain || "") ||
    /iphone|galaxy|pixel/i.test(visionBlob);

  if ((priorIsCard && visionIsPhone) || (priorIsPhone && visionIsCard)) {
    return {
      verdict: "NEW_OBJECT",
      reason: "cross_domain_card_phone",
      blockedPriorFields: [...ITEM_SCOPED_FIELDS],
    };
  }
  if ((priorIsVehicle && !visionIsVehicle && visionId) || (!priorIsVehicle && visionIsVehicle)) {
    if (overlap < 0.35) {
      return {
        verdict: "NEW_OBJECT",
        reason: "cross_domain_vehicle",
        blockedPriorFields: [...ITEM_SCOPED_FIELDS],
      };
    }
  }

  if (overlap >= 0.45 || (overlap >= 0.25 && visionId && priorTitle && visionId.includes(priorTitle.split(" ")[0]))) {
    return {
      verdict: "SAME_OBJECT",
      reason: `token_overlap:${overlap.toFixed(2)}`,
      blockedPriorFields: [],
    };
  }

  if (overlap < 0.2 && visionId && priorTitle && visionId !== priorTitle) {
    return {
      verdict: "NEW_OBJECT",
      reason: `low_overlap:${overlap.toFixed(2)}`,
      blockedPriorFields: [...ITEM_SCOPED_FIELDS],
    };
  }

  // Ambiguous — still block price/condition inheritance unless USER explicitly locked later
  return {
    verdict: "UNKNOWN",
    reason: `ambiguous_overlap:${overlap.toFixed(2)}`,
    blockedPriorFields: ["price", "condition", "title", "description", "extras"],
  };
}

/** Strip item-scoped prior fields from a draft before merge (location may persist). */
export function stripBlockedPriorFields<T extends Record<string, unknown>>(
  prior: T | null | undefined,
  blocked: string[]
): Partial<T> {
  if (!prior || !blocked.length) return { ...(prior || {}) } as Partial<T>;
  const out: Record<string, unknown> = { ...prior };
  for (const key of blocked) {
    delete out[key];
  }
  return out as Partial<T>;
}
