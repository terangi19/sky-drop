/**
 * Structured listing composer — premium title + category-aware human description.
 * Description path: facts → type writer → quality pass (awhina-listing-description).
 */

import {
  buildPremiumListingTitle,
  resolveListingDescriptionStyle,
  type ListingDescriptionQuality,
} from "./awhina-product-ux";
import {
  buildListingDescriptionFromFacts,
  removeStructuredPriceCopy,
  splitListingDescriptionSentences,
  stripStructuredMetadataLeakage,
} from "./awhina-listing-description";
import {
  buildDescriptionWriterFacts,
  runAwhinaListingDescriptionWriter,
  validateAiListingDescription,
  type DescriptionWriterAttempt,
  type DescriptionWriterRunOptions,
} from "./awhina-description-writer";
import {
  composeListingIdentity,
  guardAdjacentIdentityDuplication,
} from "./awhina-listing-identity";
import {
  inferPhysicalCategoryFromText,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  parseVehicleMake,
  parseVehicleModel,
  parseVehicleYear,
  resolveVehicleIdentity,
} from "./sky-ai-find-routing";
import { extractServiceOfferingTitle, hasServiceOfferingIntent } from "./sky-ai-intent";
import { SERVICE_LISTING_CATEGORY_LIST } from "./listing-type-config";
import {
  groupedSellerEvidenceFromExtras,
  sellerEvidenceItemCount,
} from "./awhina-seller-evidence";

export type ListingComposeSeed = {
  item: string;
  condition?: string;
  price?: string;
  location?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  extras?: string[];
  listingType?: string;
  category?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColour?: string;
  vehicleOdometer?: string;
  vehicleTransmission?: string;
  vehicleFuelType?: string;
  vehicleBodyType?: string;
  servicePricingType?: string;
  serviceDuration?: string;
  quality?: ListingDescriptionQuality;
};

export type ComposedListingCopy = Pick<
  SkyAiListingFill,
  | "title"
  | "description"
  | "category"
  | "listingType"
  | "vehicleMake"
  | "vehicleModel"
  | "vehicleYear"
> & {
  style: ReturnType<typeof resolveListingDescriptionStyle>;
};

function detectVehicle(item: string): boolean {
  const identity = resolveVehicleIdentity(item);
  return (
    identity.confidence === "high" ||
    Boolean(identity.make && identity.model) ||
    /toyota|mazda|honda|ford|bmw|nissan|subaru|ute|car\b|vehicle|\d{2,3}[\s,]?\d{3}\s*km/i.test(
      item
    ) ||
    Boolean(parseVehicleMake(item))
  );
}

function detectService(item: string): boolean {
  return (
    hasServiceOfferingIntent(item) ||
    Boolean(extractServiceOfferingTitle(item)) ||
    /\b(lawn\s*mowing|house\s*clean|photographer|tutor|plumbing|handyman|dog\s*walking)\b/i.test(
      item
    )
  );
}

function inferServiceCategory(item: string): string {
  const lower = item.toLowerCase();
  if (/photo/.test(lower)) return "Photography";
  if (/tutor|lesson|teach/.test(lower)) return "Tutoring & Lessons";
  if (/clean/.test(lower)) return "Cleaning & Maintenance";
  if (/train/.test(lower)) return "Personal Training";
  if (/mow|lawn|plumb|handyman|paint|deck|fix|electr|garden|landscap/.test(lower)) {
    return "Trades & Repairs";
  }
  return SERVICE_LISTING_CATEGORY_LIST.includes("Other Services")
    ? "Other Services"
    : "Trades & Repairs";
}

/**
 * Final public-title guard for vehicle identities.
 * Canonicalises common chassis/variant casing and removes accidental adjacent
 * duplicates introduced when a structured variant is appended after title-case.
 */
function normalizeAwhinaListingTitle(fill: SkyAiListingFill): SkyAiListingFill {
  const raw = fill.title?.trim();
  if (!raw) return fill;
  const vehicleLike =
    fill.listingType === "vehicle" ||
    Boolean(fill.vehicleMake || fill.vehicleModel || fill.vehicleGeneration) ||
    /\b(?:r\s*3[2-4]|gt[\s-]?[tr])\b/i.test(raw);
  if (!vehicleLike) return fill;

  let title = raw
    .replace(/\bgt[\s-]?t\b/gi, "GTT")
    .replace(/\bgt[\s-]?r\b/gi, "GT-R")
    .replace(/\br\s*([3][2-4])\b/gi, "R$1")
    .replace(/\s+/g, " ")
    .trim();
  title = guardAdjacentIdentityDuplication(title)
    .replace(/\bgt[\s-]?t\b/gi, "GTT")
    .replace(/\bgt[\s-]?r\b/gi, "GT-R")
    .replace(/\br\s*([3][2-4])\b/gi, "R$1")
    .replace(/\s+/g, " ")
    .trim();

  return title === raw ? fill : { ...fill, title: title.slice(0, 120) };
}

/**
 * Compose premium title + Premium Plus description from known seed facts only.
 */
export function composeListingTitleAndDescription(
  seed: ListingComposeSeed
): ComposedListingCopy {
  const item = seed.item.trim();
  const service = seed.listingType === "service" || detectService(item);
  const identity = resolveVehicleIdentity(item);
  const vehicle =
    !service &&
    (seed.listingType === "vehicle" ||
      detectVehicle(item) ||
      Boolean(seed.vehicleMake || seed.vehicleModel));
  // Known vehicle identity wins over a soft "physical" type hint from the caller
  const listingType = service
    ? "service"
    : vehicle
      ? "vehicle"
      : seed.listingType || "physical";
  const make = seed.vehicleMake || identity.make || parseVehicleMake(item);
  const model = seed.vehicleModel || identity.model || parseVehicleModel(item);
  const year = seed.vehicleYear || identity.year || parseVehicleYear(item);

  const titleCore =
    vehicle && (make || model)
      ? composeListingIdentity({
          year,
          brand: make,
          product: model,
        }) || item
      : extractServiceOfferingTitle(item) || item;

  const title = buildPremiumListingTitle({
    item: titleCore,
    condition: seed.condition,
    listingType,
    vehicleYear: year,
    brand: make,
    model: vehicle ? undefined : model,
  });

  const category =
    seed.category ||
    (listingType === "vehicle"
      ? "Cars"
      : listingType === "service"
        ? inferServiceCategory(`${item} ${title}`)
        : inferPhysicalCategoryFromText(`${item} ${title}`) || "Other");

  const fill: SkyAiListingFill = {
    title,
    condition: seed.condition,
    price: seed.price,
    location: seed.location,
    pickupAvailable: seed.pickupAvailable,
    shippingAvailable: seed.shippingAvailable,
    extras: seed.extras,
    listingType,
    category,
    vehicleMake: make,
    vehicleModel: model,
    vehicleYear: year,
    vehicleColour: seed.vehicleColour,
    vehicleOdometer: seed.vehicleOdometer,
    vehicleTransmission: seed.vehicleTransmission,
    vehicleFuelType: seed.vehicleFuelType,
    vehicleBodyType: seed.vehicleBodyType,
    servicePricingType: seed.servicePricingType,
    serviceDuration: seed.serviceDuration,
  };

  const normalizedFill = normalizeAwhinaListingTitle(fill);
  const quality = seed.quality ?? "premium_plus";
  // Seed composition is public-facing too. It must cross the same ownership
  // and price-free finalizer boundary as vision, chat, and draft updates.
  const description = finalizeAwhinaListingDescription(normalizedFill, { quality }).description;
  const style = resolveListingDescriptionStyle(normalizedFill);

  return {
    title: normalizedFill.title || title,
    description,
    category,
    listingType,
    vehicleMake: make,
    vehicleModel: model,
    vehicleYear: year,
    style,
  };
}

/** Re-compose description after draft fields change (keeps title unless raw). */
export function recomposeListingDescription(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality; force?: boolean }
): string {
  return buildListingDescriptionFromFacts(fill, {
    quality: opts?.quality ?? "premium_plus",
    force: opts?.force,
  });
}

/**
 * The sole finalizer for Āwhina-owned buyer copy.
 *
 * Raw vision/model proposals are not trusted. Validated grounded-writer prose
 * is kept so client re-finalize cannot collapse premium copy back into
 * title+condition templates. Templates remain the offline/fallback path.
 * A seller-authored description remains untouched unless an explicit rewrite
 * has set `force`.
 */
export function finalizeAwhinaListingDescription(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality; force?: boolean }
): SkyAiListingFill {
  fill = normalizeAwhinaListingTitle(fill);
  if (fill.descriptionSource === "user" && fill.description?.trim() && !opts?.force) {
    return { ...fill, description: fill.description.trim() };
  }

  if (!opts?.force && fill.description?.trim()) {
    const facts = buildDescriptionWriterFacts(fill);
    const kept = validateAiListingDescription(fill.description, facts);
    const conditionPhrase = fill.condition?.trim()
      ? fill.condition.replace(/^Used\s*-\s*/i, "").toLowerCase()
      : "";
    const reflectsCondition =
      !conditionPhrase ||
      new RegExp(
        conditionPhrase
          .split(/\s+/)
          .filter((word) => word.length > 2)
          .join("|") || "condition",
        "i"
      ).test(kept || "");
    // Only keep writer prose when it still matches current description-relevant
    // facts. A price-free set description must not block a later condition weave.
    if (kept && reflectsCondition) {
      return {
        ...fill,
        description: kept,
        descriptionSource: "ai",
      };
    }
  }

  let description = recomposeListingDescription(fill, {
    ...opts,
    force: opts?.force || Boolean(fill.description?.trim()),
  });
  description = removeStructuredPriceCopy(description);
  description = stripStructuredMetadataLeakage(description);
  // Contact actions already exist in the listing UI; never auto-pad public
  // copy with a template CTA.
  description = splitListingDescriptionSentences(description)
    .filter(
      (sentence) =>
        !/\b(message|get in touch|feel free|send me a message|drop me a message|happy to (sort|arrange|chat|answer)|if you'?re (interested|keen)|come take a look|just message)\b/i.test(
          sentence
        )
    )
    .join(" ")
    .trim();
  return {
    ...fill,
    description,
    descriptionSource: "ai",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The asynchronous writer normally replaces this draft. If it is unavailable
 * or rejects unsafe prose, do not expose the legacy "title + condition +
 * location" fallback for ordinary goods.
 */
function removePhysicalFallbackLocation(
  description: string,
  fill: SkyAiListingFill
): string {
  if (fill.listingType && fill.listingType !== "physical") return description;
  if (sellerEvidenceItemCount(groupedSellerEvidenceFromExtras(fill.extras, fill.location)) >= 2) {
    return description;
  }
  const location = (fill.location || fill.pickupArea || "").trim();
  if (!location) return description;
  return description
    .replace(
      new RegExp(`\\s+(?:for sale\\s+)?in\\s+${escapeRegExp(location)}(?=[.,!?]|$)`, "gi"),
      ""
    )
    .replace(
      new RegExp(`\\s+(?:shipping from|can ship from)\\s+${escapeRegExp(location)}`, "gi"),
      " Shipping"
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

function hasAcceptableOfflineFallback(
  description: string,
  fill: SkyAiListingFill
): boolean {
  const text = description.trim();
  if (!text || /\b(?:standout|performance and design|perfect for|ideal for|must-have|great addition|don'?t miss out|classic era|represents a)\b/i.test(text)) {
    return false;
  }
  if (/\b(?:asking\s+\$|priced at\s+\$)\b/i.test(text)) {
    return false;
  }
  if (/\bfor sale in\b/i.test(text) && fill.listingType === "physical") {
    return false;
  }
  if (/\blocated in\b/i.test(text) && !(fill.location || fill.pickupArea || "").trim()) {
    return false;
  }
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(?:brand[- ]new|like[- ]new|good used condition|good condition|fair condition)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  // A title or title+condition is never a useful offline public description.
  return normalized(text) !== normalized(fill.title || "");
}

function logAsyncDescriptionOutcome(
  attempt: DescriptionWriterAttempt,
  fallbackSelected: boolean,
  finalDescription: string | undefined
): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[awhina:description-finalizer]", {
    ...attempt,
    fallback_selected: fallbackSelected,
    final_description: finalDescription || "",
  });
}

/**
 * Async public-copy path: templates first, then one grounded writing call.
 * Fail-open to the deterministic finalizer if the writer is unavailable.
 */
export async function finalizeAwhinaListingDescriptionAsync(
  fill: SkyAiListingFill,
  opts?: {
    quality?: ListingDescriptionQuality;
    force?: boolean;
    /** Test/server seam for exercising the entire writer/validator boundary. */
    writer?: DescriptionWriterRunOptions["generateRawOutput"];
  }
): Promise<SkyAiListingFill> {
  fill = normalizeAwhinaListingTitle(fill);
  // Preserve seller-owned and already-valid AI prose before attempting a
  // rewrite. The writer is authoritative for fresh AI copy; templates are
  // evaluated only if that attempt cannot produce valid public prose.
  if (fill.descriptionSource === "user" && fill.description?.trim() && !opts?.force) {
    return finalizeAwhinaListingDescription(fill, opts);
  }

  const previousValid = fill.description?.trim()
    ? validateAiListingDescription(fill.description, buildDescriptionWriterFacts(fill))
    : null;
  const attempt = await runAwhinaListingDescriptionWriter(fill, {
    force: opts?.force,
    generateRawOutput: opts?.writer,
  });
  if (attempt.description) {
    const result = { ...fill, description: attempt.description, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, false, result.description);
    return result;
  }

  if (previousValid) {
    const result = { ...fill, description: previousValid, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, false, result.description);
    return result;
  }

  const deterministic = finalizeAwhinaListingDescription(fill, opts);
  const fallback = removePhysicalFallbackLocation(deterministic.description || "", fill);
  if (hasAcceptableOfflineFallback(fallback, fill)) {
    const result = { ...deterministic, description: fallback, descriptionSource: "ai" as const };
    logAsyncDescriptionOutcome(attempt, true, result.description);
    return result;
  }

  // A bad fallback is worse than no copy: keep the draft factually clean and
  // make the writer failure visible in development diagnostics.
  const result = { ...deterministic, description: "", descriptionSource: "ai" as const };
  logAsyncDescriptionOutcome(attempt, true, result.description);
  return result;
}
