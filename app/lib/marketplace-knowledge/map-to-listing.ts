/**
 * Map resolved marketplace knowledge → Sky Drop listing hints.
 * Never invents prices, pop, authenticity, or overwrites USER facts.
 */

import type { MarketplaceEntity, MarketplaceListingHints, KnowledgeProvenance } from "./types";
import { mayOverwrite } from "./provenance";

export type ListingFactProvenance = Record<string, KnowledgeProvenance>;

export function mapEntityToListingHints(
  entity: MarketplaceEntity | null | undefined,
  opts?: {
    /** Existing draft / user facts — USER wins */
    existing?: Partial<MarketplaceListingHints>;
    existingProvenance?: ListingFactProvenance;
  }
): MarketplaceListingHints {
  if (!entity) return { ...(opts?.existing || {}) };

  const existing = opts?.existing || {};
  const prov = opts?.existingProvenance || {};
  const hints: MarketplaceListingHints = { ...existing };

  const set = <K extends keyof MarketplaceListingHints>(
    key: K,
    value: MarketplaceListingHints[K],
    incoming: KnowledgeProvenance
  ) => {
    if (value == null || value === "") return;
    const cur = existing[key];
    if (cur != null && cur !== "" && !mayOverwrite(prov[key as string], incoming)) {
      return;
    }
    if (cur != null && cur !== "" && prov[key as string] === "USER") return;
    hints[key] = value;
  };

  if (entity.category?.listingTypeHint) {
    set("listingType", entity.category.listingTypeHint, entity.provenance);
  }
  if (entity.category?.skyDropCategory) {
    set("category", entity.category.skyDropCategory, entity.provenance);
  }
  if (entity.displayName) {
    set("titleHint", entity.displayName, entity.provenance);
  }

  if (entity.domain === "vehicles") {
    if (entity.brand?.name) set("vehicleMake", entity.brand.name, entity.provenance);
    if (entity.model?.name) {
      // Preserve user trim facts in model display without inventing
      const trim = entity.userFacts.find((f) => /^(GT-T|GT-R|Type R|STI|M Sport)/i.test(f));
      const modelName =
        trim && !entity.model.name.toLowerCase().includes(trim.toLowerCase().replace(/-/g, ""))
          ? `${entity.model.name} ${trim}`
          : entity.model.name;
      set("vehicleModel", modelName, entity.provenance);
    }
    const yearAttr = entity.attributes.find((a) => a.key === "year");
    // year on vehicles comes from identity — check display / unknowns
    const yearFromDisplay = entity.displayName.match(/\b((?:19|20)\d{2})\b/);
    if (yearAttr) set("vehicleYear", yearAttr.value, yearAttr.provenance);
    else if (yearFromDisplay && !entity.unknowns.includes("year")) {
      set("vehicleYear", yearFromDisplay[1], "LOCAL_DATA");
    }
    const gen = entity.generation?.code;
    if (gen) set("vehicleBodyType", undefined, "LOCAL_DATA"); // don't misuse bodyType
  }

  if (entity.domain === "equipment" && entity.category?.listingTypeHint === "rental") {
    set("listingType", "rental", "LOCAL_DATA");
    set("rentalSubType", "Equipment", "LOCAL_DATA");
    const daily = entity.attributes.find((a) => a.key === "dailyRate");
    if (daily) set("rentalPriceDaily", daily.value, daily.provenance);
  }

  if (entity.domain === "services") {
    set("listingType", "service", "LOCAL_DATA");
    if (entity.category?.skyDropCategory) set("category", entity.category.skyDropCategory, "LOCAL_DATA");
    if (entity.attributes.some((a) => a.key === "hourlyRate")) {
      set("servicePricingType", "Hourly Rate", "USER");
    } else if (entity.attributes.some((a) => a.key === "price")) {
      set("servicePricingType", "Fixed Price", "USER");
    }
  }

  if (entity.domain === "collectibles") {
    const extras = [...(existing.extras || [])];
    if (entity.grade?.company && entity.grade.grade) {
      const g = `${entity.grade.company} ${entity.grade.grade}`;
      if (!extras.includes(g)) extras.push(g);
    }
    for (const a of entity.attributes) {
      if (a.key === "set" || a.key === "subject" || a.key === "parallel" || a.key === "cardNumber" || a.key === "year") {
        const label = `${a.key}:${a.value}`;
        if (!extras.includes(label)) extras.push(label);
      }
    }
    if (extras.length) hints.extras = extras.slice(0, 12);
    set(
      "category",
      entity.category?.skyDropCategory || "Collectibles",
      "LOCAL_DATA"
    );
    set("listingType", "physical", "LOCAL_DATA");
  }

  if (entity.domain === "electronics" || entity.domain === "gaming") {
    if (entity.category?.skyDropCategory) set("category", entity.category.skyDropCategory, "LOCAL_DATA");
    set("listingType", "physical", "LOCAL_DATA");
    const extras = [...(existing.extras || [])];
    for (const a of entity.attributes) {
      if (a.key === "storage" || a.key === "colour") {
        if (!extras.includes(a.value)) extras.push(a.value);
      }
    }
    if (extras.length) hints.extras = extras.slice(0, 12);
  }

  if (entity.domain === "fashion") {
    set("category", "Fashion", "LOCAL_DATA");
    set("listingType", "physical", "LOCAL_DATA");
    const extras = [...(existing.extras || [])];
    for (const a of entity.attributes) {
      if (a.key === "size") extras.push(`Size ${a.value}`);
      if (a.key === "colourway") extras.push(a.value);
    }
    if (extras.length) hints.extras = extras.slice(0, 12);
  }

  hints.attributes = entity.attributes;
  return hints;
}
