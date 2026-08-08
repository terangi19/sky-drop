/**
 * Canonical listing-type + category source of truth.
 * Used by create/edit, browse pages, search, Āwhina fill, and detail cards.
 */

export const CANONICAL_LISTING_TYPES = [
  "physical",
  "service",
  "rental",
  "vehicle",
  "wanted",
] as const;

export type CanonicalListingType = (typeof CANONICAL_LISTING_TYPES)[number];

/** All persisted listing types (includes legacy verticals). */
export const ALL_LISTING_TYPES = [
  ...CANONICAL_LISTING_TYPES,
  "digital",
  "event",
  "job",
  "property",
] as const;

export type ListingType = (typeof ALL_LISTING_TYPES)[number];

export const PHYSICAL_LISTING_CATEGORIES = [
  "Tech",
  "Cars",
  "Gaming",
  "Fashion",
  "Home",
  "Sports",
  "Other",
] as const;

export const SERVICE_LISTING_CATEGORY_LIST = [
  "Trades & Repairs",
  "Cleaning & Maintenance",
  "Tutoring & Lessons",
  "Photography",
  "Personal Training",
  "Events & Catering",
  "Other Services",
] as const;

export const RENTAL_LISTING_CATEGORY_LIST = [
  "Equipment",
  "Vehicles",
  "Property",
  "Other",
] as const;

export const WANTED_LISTING_CATEGORIES = [
  "Items",
  "Services",
  "Rentals",
  "Vehicles",
] as const;

export const VEHICLE_LISTING_CATEGORIES = ["Cars"] as const;

export const SERVICE_LISTING_CATEGORIES = new Set<string>(
  SERVICE_LISTING_CATEGORY_LIST
);

export const RENTAL_LISTING_CATEGORIES = new Set<string>(
  RENTAL_LISTING_CATEGORY_LIST
);

export const RENTAL_SUB_TYPES = ["equipment", "vehicle", "property"] as const;
export type RentalSubType = (typeof RENTAL_SUB_TYPES)[number];

/** Equipment/vehicle rentals: primary `price` is the daily rate unless rentalRatePeriod is set. */
export const RENTAL_RATE_PERIODS = ["hour", "day", "week", "month"] as const;
export type RentalRatePeriod = (typeof RENTAL_RATE_PERIODS)[number];

/** Daily is the V1 invariant for equipment/vehicle when only `price` is set. */
export const DEFAULT_RENTAL_RATE_PERIOD: RentalRatePeriod = "day";

export function categoriesForListingType(type?: string | null): readonly string[] {
  switch (type) {
    case "service":
      return SERVICE_LISTING_CATEGORY_LIST;
    case "rental":
      return RENTAL_LISTING_CATEGORY_LIST;
    case "wanted":
      return WANTED_LISTING_CATEGORIES;
    case "vehicle":
      return VEHICLE_LISTING_CATEGORIES;
    default:
      return PHYSICAL_LISTING_CATEGORIES;
  }
}

export function browseFilterCategories(type: "service" | "rental" | "wanted" | "vehicle"): string[] {
  return ["All", ...categoriesForListingType(type)];
}

export function isServiceListingCategory(category?: string | null): boolean {
  return !!category && SERVICE_LISTING_CATEGORIES.has(category);
}

export function isRentalListingCategory(category?: string | null): boolean {
  return !!category && RENTAL_LISTING_CATEGORIES.has(category);
}

export function isCanonicalListingType(type?: string | null): type is CanonicalListingType {
  return !!type && (CANONICAL_LISTING_TYPES as readonly string[]).includes(type);
}

/** Types that never use marketplace checkout / Buy Now in V1. */
export function isMessagingOnlyListingType(type?: string | null): boolean {
  const t = (type || "").toLowerCase();
  return (
    t === "service" ||
    t === "rental" ||
    t === "property" ||
    t === "wanted" ||
    t === "job"
  );
}

/** Condition is meaningful for physical goods and vehicles (not services/wanted/property rentals). */
export function listingSupportsCondition(type?: string | null): boolean {
  const t = (type || "physical").toLowerCase();
  return t === "physical" || t === "vehicle" || t === "digital";
}

/** Sale type (auction / buy_now) only applies to sellable goods. */
export function listingSupportsSaleType(type?: string | null): boolean {
  const t = (type || "physical").toLowerCase();
  return t === "physical" || t === "vehicle" || t === "digital" || t === "event";
}

/** Price/budget/rate filters apply when the listing has a comparable numeric amount. */
export function listingSupportsPriceFilter(type?: string | null): boolean {
  const t = (type || "physical").toLowerCase();
  return (
    t === "physical" ||
    t === "vehicle" ||
    t === "service" ||
    t === "rental" ||
    t === "property" ||
    t === "wanted" ||
    t === "digital"
  );
}

export function listingSupportsServicePricingFilter(type?: string | null): boolean {
  return (type || "").toLowerCase() === "service";
}

export function listingSupportsRentalRatePeriodFilter(type?: string | null): boolean {
  const t = (type || "").toLowerCase();
  return t === "rental" || t === "property";
}

export function listingSupportsWantedBudgetFilter(type?: string | null): boolean {
  return (type || "").toLowerCase() === "wanted";
}

/**
 * Primary CTA label for messaging / contact.
 * Wanted = responder CTA (buyer demand, not seller).
 */
export function messageCtaLabel(type?: string | null): string {
  const t = (type || "").toLowerCase();
  if (t === "service") return "Message Provider";
  if (t === "rental" || t === "property") return "Message Owner";
  if (t === "wanted") return "I Can Help";
  if (t === "job") return "Apply / Message";
  return "Message Seller";
}

export type EmptyListKind = CanonicalListingType | "service" | "rental";

export function emptyListCtaLabel(type: EmptyListKind): string {
  switch (type) {
    case "service":
      return "Offer a service";
    case "rental":
      return "List something for rent";
    case "wanted":
      return "Post what you're looking for";
    case "vehicle":
      return "List a vehicle";
    case "physical":
    default:
      return "List an item";
  }
}

export function emptyListHeadline(type: EmptyListKind): string {
  switch (type) {
    case "service":
      return "No services yet";
    case "rental":
      return "No rentals yet";
    case "wanted":
      return "No wanted posts yet";
    case "vehicle":
      return "No vehicles yet";
    case "physical":
    default:
      return "No listings yet";
  }
}

export function emptyListBody(type: EmptyListKind): string {
  switch (type) {
    case "service":
      return "Be the first to offer a service.";
    case "rental":
      return "Be the first to list something for rent.";
    case "wanted":
      return "Post what you're looking for and let sellers come to you.";
    case "vehicle":
      return "Be the first to list a vehicle for sale.";
    case "physical":
    default:
      return "Be the first to list something for sale.";
  }
}

/** Fields that must not leak across type switches into sale drafts. */
export const TYPE_ISOLATION_CLEAR_FIELDS: Record<string, readonly string[]> = {
  physical: [
    "servicePricingType",
    "serviceDuration",
    "rentalSubType",
    "rentalPriceWeekly",
    "rentalPriceMonthly",
    "rentalDeposit",
    "rentalAvailableDate",
    "rentalRatePeriod",
    "rentalBedrooms",
    "rentalBathrooms",
    "rentalParkingSpaces",
    "rentalPropertyType",
    "rentalFurnishedStatus",
    "rentalPetsPolicy",
    "rentalMinTenancy",
    "rentalFeatures",
  ],
  vehicle: [
    "servicePricingType",
    "serviceDuration",
    "rentalSubType",
    "rentalPriceWeekly",
    "rentalPriceMonthly",
    "rentalDeposit",
    "rentalAvailableDate",
    "rentalRatePeriod",
  ],
  service: [
    "condition",
    "saleType",
    "shippingAvailable",
    "shippingFee",
    "freeShipping",
    "rentalSubType",
    "rentalPriceWeekly",
    "rentalPriceMonthly",
    "rentalDeposit",
    "rentalAvailableDate",
    "rentalRatePeriod",
    "vehicleMake",
    "vehicleModel",
    "vehicleYear",
    "vehicleOdometer",
    "vehicleFuelType",
    "vehicleTransmission",
    "vehicleBodyType",
    "vehicleColour",
  ],
  rental: [
    "saleType",
    "shippingAvailable",
    "shippingFee",
    "freeShipping",
    "servicePricingType",
    "serviceDuration",
  ],
  wanted: [
    "condition",
    "saleType",
    "shippingAvailable",
    "shippingFee",
    "freeShipping",
    "pickupAvailable",
    "stockQuantity",
    "servicePricingType",
    "serviceDuration",
    "rentalSubType",
    "rentalPriceWeekly",
    "rentalPriceMonthly",
    "rentalDeposit",
    "rentalAvailableDate",
    "rentalRatePeriod",
    "acceptOffers",
    "paymentType",
  ],
};
