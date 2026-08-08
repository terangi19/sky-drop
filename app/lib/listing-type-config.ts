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

export const SERVICE_LISTING_CATEGORIES = new Set<string>(
  SERVICE_LISTING_CATEGORY_LIST
);

export const RENTAL_LISTING_CATEGORIES = new Set<string>(
  RENTAL_LISTING_CATEGORY_LIST
);

export const RENTAL_SUB_TYPES = ["equipment", "vehicle", "property"] as const;
export type RentalSubType = (typeof RENTAL_SUB_TYPES)[number];

export function categoriesForListingType(type?: string | null): readonly string[] {
  switch (type) {
    case "service":
      return SERVICE_LISTING_CATEGORY_LIST;
    case "rental":
      return RENTAL_LISTING_CATEGORY_LIST;
    case "wanted":
      return WANTED_LISTING_CATEGORIES;
    case "vehicle":
      return ["Cars"] as const;
    default:
      return PHYSICAL_LISTING_CATEGORIES;
  }
}

export function browseFilterCategories(type: "service" | "rental"): string[] {
  return ["All", ...categoriesForListingType(type)];
}

export function isServiceListingCategory(category?: string | null): boolean {
  return !!category && SERVICE_LISTING_CATEGORIES.has(category);
}

export function isRentalListingCategory(category?: string | null): boolean {
  return !!category && RENTAL_LISTING_CATEGORIES.has(category);
}

export function messageCtaLabel(type?: string | null): string {
  if (type === "service") return "Message Provider";
  if (type === "rental" || type === "property") return "Message Owner";
  return "Message Seller";
}

export function emptyListCtaLabel(type: "service" | "rental"): string {
  return type === "service" ? "Offer a service" : "List something for rent";
}

export function emptyListHeadline(type: "service" | "rental"): string {
  return type === "service" ? "No services yet" : "No rentals yet";
}

export function emptyListBody(type: "service" | "rental"): string {
  return type === "service"
    ? "Be the first to offer a service."
    : "Be the first to list something for rent.";
}
