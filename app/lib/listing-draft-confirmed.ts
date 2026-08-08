/**
 * Confirmed listing-draft sync — unknown stays unknown.
 *
 * UI placeholders / untouched semantic defaults must NEVER become listingContext
 * facts for Āwhina. Only USER | AWHINA | IMAGE | EDITED_EXISTING_LISTING values sync.
 */

import type { SkyAiListingContext } from "./sky-ai-types";

export type ListingFieldProvenance =
  | "USER"
  | "AWHINA"
  | "IMAGE"
  | "EDITED_EXISTING_LISTING"
  | "DEFAULT_UNTOUCHED";

/** Semantic fields that invent product facts if defaulted. */
export const SEMANTIC_LISTING_FIELDS = [
  "condition",
  "vehicleBodyType",
  "vehicleFuelType",
  "vehicleTransmission",
  "vehicleMake",
  "vehicleModel",
  "vehicleGeneration",
  "vehicleYear",
  "vehicleOdometer",
  "vehicleColour",
  "rentalPropertyType",
  "rentalFurnishedStatus",
  "rentalPetsPolicy",
  "rentalMinTenancy",
  "rentalPriceWeekly",
  "rentalPriceMonthly",
  "rentalDeposit",
  "rentalBedrooms",
  "rentalBathrooms",
  "rentalParkingSpaces",
  "rentalAvailableDate",
  "title",
  "description",
  "price",
  "location",
  "stockQuantity",
  "serviceDuration",
  "category",
] as const;

export type SemanticListingField = (typeof SEMANTIC_LISTING_FIELDS)[number];

/**
 * Historical UI defaults that leaked into AI as "facts".
 * Never treat these as confirmed unless provenance says so.
 */
export const FORBIDDEN_SEMANTIC_DEFAULTS: Partial<
  Record<SemanticListingField | string, string[]>
> = {
  condition: ["New", "Brand New"],
  vehicleBodyType: ["SUV"],
  vehicleFuelType: ["Petrol"],
  vehicleTransmission: ["Automatic"],
  rentalPropertyType: ["House"],
  rentalFurnishedStatus: ["Unfurnished"],
  rentalPetsPolicy: ["No Pets"],
  rentalMinTenancy: ["Flexible"],
  category: ["Other"],
};

const STRUCTURAL_SHELL_FIELDS = new Set([
  "listingType",
  "paymentType",
  "rentalSubType",
  "pricingType",
]);

const CONFIRMED: ReadonlySet<ListingFieldProvenance> = new Set([
  "USER",
  "AWHINA",
  "IMAGE",
  "EDITED_EXISTING_LISTING",
]);

export function isConfirmedProvenance(
  p: ListingFieldProvenance | undefined
): boolean {
  return Boolean(p && CONFIRMED.has(p));
}

export function isForbiddenUntouchedDefault(
  key: string,
  value: string,
  provenance?: ListingFieldProvenance
): boolean {
  if (isConfirmedProvenance(provenance)) return false;
  const banned = FORBIDDEN_SEMANTIC_DEFAULTS[key];
  if (!banned) return false;
  return banned.some((b) => b.toLowerCase() === value.trim().toLowerCase());
}

export type ListingDraftFormSnapshot = {
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  listingType?: string;
  location?: string;
  paymentType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleGeneration?: string;
  vehicleYear?: string;
  vehicleOdometer?: string;
  vehicleColour?: string;
  vehicleBodyType?: string;
  vehicleFuelType?: string;
  vehicleTransmission?: string;
  rentalSubType?: string;
  rentalPropertyType?: string;
  rentalPriceWeekly?: string;
  rentalPriceMonthly?: string;
  rentalDeposit?: string;
  rentalBedrooms?: string;
  rentalBathrooms?: string;
  rentalParkingSpaces?: string;
  rentalFurnishedStatus?: string;
  rentalPetsPolicy?: string;
  rentalAvailableDate?: string;
  rentalMinTenancy?: string;
  stockQuantity?: string;
  serviceDuration?: string;
  extras?: string[];
};

export type ListingFieldProvenanceMap = Partial<
  Record<keyof ListingDraftFormSnapshot, ListingFieldProvenance>
>;

/**
 * Build listingContext for Āwhina: only meaningful confirmed values.
 * Empty / untouched defaults are omitted (unknown).
 */
export function buildConfirmedListingContext(
  form: ListingDraftFormSnapshot,
  provenance: ListingFieldProvenanceMap = {}
): SkyAiListingContext {
  const out: SkyAiListingContext = {};
  let hasSemanticFact = false;

  const putString = (key: keyof ListingDraftFormSnapshot, value: string | undefined) => {
    if (value == null) return;
    const v = String(value).trim();
    if (!v) return;
    // Untouched fake defaults (New/SUV/Petrol/Automatic/…) never sync
    if (isForbiddenUntouchedDefault(key, v, provenance[key])) return;
    // Structural shells deferred until real content exists (handled below)
    if (
      !isConfirmedProvenance(provenance[key]) &&
      STRUCTURAL_SHELL_FIELDS.has(key)
    ) {
      return;
    }
    // Non-empty semantic values without provenance still sync (e.g. typed title)
    // except forbidden default VALUES already filtered above.
    (out as Record<string, string>)[key] = v;
    if (!STRUCTURAL_SHELL_FIELDS.has(key)) hasSemanticFact = true;
  };

  putString("title", form.title);
  putString("description", form.description);
  putString("category", form.category);
  putString("condition", form.condition);
  putString("price", form.price);
  putString("location", form.location);
  putString("vehicleMake", form.vehicleMake);
  putString("vehicleModel", form.vehicleModel);
  putString("vehicleGeneration", form.vehicleGeneration);
  putString("vehicleYear", form.vehicleYear);
  putString("vehicleOdometer", form.vehicleOdometer);
  putString("vehicleColour", form.vehicleColour);
  putString("vehicleBodyType", form.vehicleBodyType);
  putString("vehicleFuelType", form.vehicleFuelType);
  putString("vehicleTransmission", form.vehicleTransmission);
  putString("rentalPropertyType", form.rentalPropertyType);
  putString("rentalPriceWeekly", form.rentalPriceWeekly);
  putString("rentalPriceMonthly", form.rentalPriceMonthly);
  putString("rentalDeposit", form.rentalDeposit);
  putString("rentalBedrooms", form.rentalBedrooms);
  putString("rentalBathrooms", form.rentalBathrooms);
  putString("rentalParkingSpaces", form.rentalParkingSpaces);
  putString("rentalFurnishedStatus", form.rentalFurnishedStatus);
  putString("rentalPetsPolicy", form.rentalPetsPolicy);
  putString("rentalAvailableDate", form.rentalAvailableDate);
  putString("rentalMinTenancy", form.rentalMinTenancy);
  putString("stockQuantity", form.stockQuantity);
  putString("serviceDuration", form.serviceDuration);

  if (form.extras?.length) {
    out.extras = form.extras.filter((x) => typeof x === "string" && x.trim());
    if (out.extras.length) hasSemanticFact = true;
    else delete out.extras;
  }

  // Structural shells only when real facts exist or explicitly confirmed
  if (hasSemanticFact || isConfirmedProvenance(provenance.listingType)) {
    const lt = form.listingType?.trim();
    if (lt) out.listingType = lt;
  }
  if (hasSemanticFact || isConfirmedProvenance(provenance.paymentType)) {
    const pt = form.paymentType?.trim();
    if (pt) out.paymentType = pt;
  }
  if (hasSemanticFact || isConfirmedProvenance(provenance.rentalSubType)) {
    const rs = form.rentalSubType?.trim();
    if (rs) out.rentalSubType = rs;
  }

  return out;
}

/** Mark many fields as the same provenance (e.g. after Āwhina fill). */
export function markProvenance(
  map: ListingFieldProvenanceMap,
  keys: (keyof ListingDraftFormSnapshot)[],
  source: ListingFieldProvenance
): ListingFieldProvenanceMap {
  const next = { ...map };
  for (const k of keys) {
    if (source === "DEFAULT_UNTOUCHED") {
      next[k] = "DEFAULT_UNTOUCHED";
    } else {
      next[k] = source;
    }
  }
  return next;
}

/**
 * Migrate legacy session drafts that synced the classic untouched form cluster
 * (SUV + Petrol + Automatic ± New) into listingContext as fake facts.
 */
export function scrubLegacyFormPollution(
  draft: SkyAiListingContext | null | undefined
): SkyAiListingContext | null {
  if (!draft) return null;
  const out: SkyAiListingContext = { ...draft };
  const body = out.vehicleBodyType?.trim();
  const fuel = out.vehicleFuelType?.trim();
  const trans = out.vehicleTransmission?.trim();
  // Exact untouched vehicle select cluster — never a coincidental user choice of all three
  if (body === "SUV" && fuel === "Petrol" && trans === "Automatic") {
    delete out.vehicleBodyType;
    delete out.vehicleFuelType;
    delete out.vehicleTransmission;
    if (out.condition === "New" || out.condition === "Brand New") {
      delete out.condition;
    }
  }
  const hasIdentity = Boolean(
    out.title?.trim() || out.vehicleMake?.trim() || out.vehicleModel?.trim()
  );
  if (
    !hasIdentity &&
    (out.condition === "New" || out.condition === "Brand New")
  ) {
    delete out.condition;
  }
  if (!hasIdentity && out.category === "Other") {
    delete out.category;
  }
  if (!hasIdentity) {
    if (out.rentalPropertyType === "House") delete out.rentalPropertyType;
    if (out.rentalFurnishedStatus === "Unfurnished") delete out.rentalFurnishedStatus;
    if (out.rentalPetsPolicy === "No Pets") delete out.rentalPetsPolicy;
    if (out.rentalMinTenancy === "Flexible") delete out.rentalMinTenancy;
  }
  return out;
}

/** True when draft still carries the classic untouched vehicle select cluster. */
export function hasClassicVehicleDefaultCluster(
  draft: SkyAiListingContext | null | undefined
): boolean {
  if (!draft) return false;
  return (
    draft.vehicleBodyType?.trim() === "SUV" &&
    draft.vehicleFuelType?.trim() === "Petrol" &&
    draft.vehicleTransmission?.trim() === "Automatic"
  );
}
