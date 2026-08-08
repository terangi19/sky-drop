/**
 * Structured listing composer — premium title + category-aware description.
 * Facts only; wraps / extends Premium Plus generators without regressing them.
 */

import {
  buildPremiumListingTitle,
  buildListingDescriptionFromFacts,
  resolveListingDescriptionStyle,
  type ListingDescriptionQuality,
} from "./awhina-product-ux";
import {
  inferPhysicalCategoryFromText,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import {
  parseVehicleMake,
  parseVehicleModel,
  parseVehicleYear,
} from "./sky-ai-find-routing";

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

/**
 * Compose premium title + Premium Plus description from known seed facts only.
 */
export function composeListingTitleAndDescription(
  seed: ListingComposeSeed
): ComposedListingCopy {
  const item = seed.item.trim();
  const vehicle = seed.listingType === "vehicle" || detectVehicle(item);
  const listingType = seed.listingType || (vehicle ? "vehicle" : "physical");
  const make = seed.vehicleMake || parseVehicleMake(item);
  const model = seed.vehicleModel || parseVehicleModel(item);
  const year = seed.vehicleYear || parseVehicleYear(item);

  const titleCore =
    vehicle && make
      ? [year, make, model].filter(Boolean).join(" ") || item
      : item;

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
