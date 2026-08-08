/**
 * Thin bridge: marketplace knowledge → Āwhina decision / fill / search.
 * Never invents prices/pop; never overwrites USER facts.
 */

import {
  resolveMarketplaceKnowledge,
  marketplaceClarifyQuestion,
  type MarketplaceResolveResult,
  type ResolveMarketplaceOptions,
} from "./resolver";
import type { MarketplaceListingHints } from "./types";

export type KnowledgeTurnPatch = {
  item?: string;
  make?: string;
  model?: string;
  year?: string;
  storage?: string;
  listingType?: "service" | "rental" | "physical" | "vehicle" | "digital";
  category?: string;
  queryHint?: string;
  extras?: string[];
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  rentalSubType?: string;
  rentalPriceDaily?: string;
  servicePricingType?: string;
  clarifyQuestion?: string;
  domain?: string;
  confidence?: "high" | "medium" | "low";
};

function asListingType(
  raw: string | undefined
): KnowledgeTurnPatch["listingType"] | undefined {
  if (
    raw === "service" ||
    raw === "rental" ||
    raw === "physical" ||
    raw === "vehicle" ||
    raw === "digital"
  ) {
    return raw;
  }
  return undefined;
}

export function resolveKnowledgeForAwhina(
  text: string,
  opts?: ResolveMarketplaceOptions
): MarketplaceResolveResult {
  return resolveMarketplaceKnowledge(text, opts);
}

/** Patch for decision-layer turn entities (fill only empty slots). */
export function knowledgeTurnPatch(
  text: string,
  opts?: ResolveMarketplaceOptions
): KnowledgeTurnPatch | null {
  const r = resolveMarketplaceKnowledge(text, opts);
  if (!r.entity) return null;
  if (r.entity.confidence === "low" && !r.listingHints.titleHint) return null;

  const h = r.listingHints;
  const storage = r.entity.attributes.find((a) => a.key === "storage");
  const patch: KnowledgeTurnPatch = {
    domain: r.entity.domain,
    confidence: r.entity.confidence,
  };

  if (r.entity.displayName) patch.item = r.entity.displayName;
  const lt = asListingType(h.listingType);
  if (lt) patch.listingType = lt;
  if (h.category) patch.category = h.category;
  if (h.vehicleMake) {
    patch.make = h.vehicleMake;
    patch.vehicleMake = h.vehicleMake;
  }
  if (h.vehicleModel) {
    patch.model = h.vehicleModel;
    patch.vehicleModel = h.vehicleModel;
  }
  if (h.vehicleYear) {
    patch.year = h.vehicleYear;
    patch.vehicleYear = h.vehicleYear;
  }
  if (storage) patch.storage = storage.value;
  if (h.extras?.length) patch.extras = h.extras;
  if (h.rentalSubType) patch.rentalSubType = h.rentalSubType;
  if (h.rentalPriceDaily) patch.rentalPriceDaily = h.rentalPriceDaily;
  if (h.servicePricingType) patch.servicePricingType = h.servicePricingType;
  if (r.entity.displayName && r.entity.confidence !== "low") {
    patch.queryHint = r.entity.displayName;
  }

  const q = marketplaceClarifyQuestion(text, opts);
  if (q && r.entity.confidence !== "high") patch.clarifyQuestion = q;

  return patch;
}

/** Merge listing hints into a fill object — existing non-empty fields win. */
export function mergeKnowledgeHintsIntoFill<T extends Record<string, unknown>>(
  fill: T,
  hints: MarketplaceListingHints,
  opts?: { allowTitle?: boolean }
): T {
  const out = { ...fill } as T & Record<string, unknown>;
  const set = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    const cur = out[key];
    if (cur != null && cur !== "") return;
    out[key] = value;
  };

  set("listingType", hints.listingType);
  set("category", hints.category);
  set("vehicleMake", hints.vehicleMake);
  set("vehicleModel", hints.vehicleModel);
  set("vehicleYear", hints.vehicleYear);
  set("rentalSubType", hints.rentalSubType);
  set("rentalPriceDaily", hints.rentalPriceDaily);
  set("servicePricingType", hints.servicePricingType);
  if (opts?.allowTitle && hints.titleHint) set("title", hints.titleHint);

  if (hints.extras?.length) {
    const existing = Array.isArray(out.extras)
      ? (out.extras as string[])
      : [];
    const merged = [...existing];
    for (const e of hints.extras) {
      if (!merged.includes(e)) merged.push(e);
    }
    out.extras = merged.slice(0, 12);
  }

  return out as T;
}
