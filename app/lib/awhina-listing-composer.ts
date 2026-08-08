/**
 * Structured listing composer — premium title + category-aware human description.
 * Description path: facts → type writer → quality pass (awhina-listing-description).
 */

import {
  buildPremiumListingTitle,
  resolveListingDescriptionStyle,
  type ListingDescriptionQuality,
} from "./awhina-product-ux";
import { buildListingDescriptionFromFacts } from "./awhina-listing-description";
import {
  inferPhysicalCategoryFromText,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  parseVehicleMake,
  parseVehicleModel,
  parseVehicleYear,
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
  return (
    /toyota|mazda|honda|ford|bmw|nissan|subaru|ute|car\b|vehicle|\d{2,3}[\s,]?\d{3}\s*km/i.test(
      item
    ) || Boolean(parseVehicleMake(item))
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
  const vehicle = !service && (seed.listingType === "vehicle" || detectVehicle(item));
  const listingType =
    seed.listingType || (service ? "service" : vehicle ? "vehicle" : "physical");
  const make = seed.vehicleMake || parseVehicleMake(item);
  const model = seed.vehicleModel || parseVehicleModel(item);
  const year = seed.vehicleYear || parseVehicleYear(item);

  const titleCore =
    vehicle && make
      ? [year, make, model].filter(Boolean).join(" ") || item
      : extractServiceOfferingTitle(item) || item;

  const title = buildPremiumListingTitle({
    item: titleCore,
    condition: seed.condition,
    listingType,
    vehicleYear: year,
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
  const description = buildListingDescriptionFromFacts(fill, { quality });
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
  opts?: { quality?: ListingDescriptionQuality }
): string {
  return buildListingDescriptionFromFacts(fill, {
    quality: opts?.quality ?? "premium_plus",
  });
}
