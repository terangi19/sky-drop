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
  stripStructuredMetadataLeakage,
} from "./awhina-listing-description";
import {
  buildDescriptionWriterFacts,
  validateAiListingDescription,
  writeAwhinaListingDescription,
} from "./awhina-description-writer";
import { composeListingIdentity } from "./awhina-listing-identity";
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

  const quality = seed.quality ?? "premium_plus";
  // Seed composition is public-facing too. It must cross the same ownership
  // and price-free finalizer boundary as vision, chat, and draft updates.
  const description = finalizeAwhinaListingDescription(fill, { quality }).description;
  const style = resolveListingDescriptionStyle(fill);

  return {
    title,
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
  description = description
    .split(/(?<=[.!?])\s+/)
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

/**
 * Async public-copy path: templates first, then one grounded writing call.
 * Fail-open to the deterministic finalizer if the writer is unavailable.
 */
export async function finalizeAwhinaListingDescriptionAsync(
  fill: SkyAiListingFill,
  opts?: { quality?: ListingDescriptionQuality; force?: boolean }
): Promise<SkyAiListingFill> {
  const finalized = finalizeAwhinaListingDescription(fill, opts);
  if (finalized.descriptionSource === "user" && !opts?.force) return finalized;
  try {
    const description = await writeAwhinaListingDescription(finalized, {
      force: opts?.force,
    });
    if (!description) return finalized;
    return {
      ...finalized,
      description,
      descriptionSource: "ai",
    };
  } catch {
    return finalized;
  }
}
