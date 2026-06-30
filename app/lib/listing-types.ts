/** Categories that always imply a service listing — not physical goods. */
export const SERVICE_LISTING_CATEGORIES = new Set([
  "Trades & Repairs",
  "Cleaning & Maintenance",
  "Tutoring & Lessons",
  "Photography",
  "Personal Training",
  "Events & Catering",
  "Other Services",
]);

const VALID_LISTING_TYPES = new Set([
  "physical",
  "digital",
  "service",
  "rental",
  "event",
  "vehicle",
  "job",
  "property",
  "wanted",
]);

export function isServiceListingCategory(category?: string | null): boolean {
  return !!category && SERVICE_LISTING_CATEGORIES.has(category);
}

/** Resolve persisted listing `type` — service categories must never save as physical. */
export function resolveListingType(input: {
  listingType?: string | null;
  type?: string | null;
  category?: string | null;
}): string {
  const fromListingType =
    input.listingType && VALID_LISTING_TYPES.has(input.listingType)
      ? input.listingType
      : null;
  const fromType =
    input.type && VALID_LISTING_TYPES.has(input.type) ? input.type : null;

  let resolved = fromListingType || fromType || "physical";

  if (resolved === "physical" && isServiceListingCategory(input.category)) {
    resolved = "service";
  }

  return resolved;
}

/** Types shown on the homepage “All listings” browse feed. */
export function isHomeBrowseListing(item: { type?: string | null }): boolean {
  return item.type !== "wanted";
}

/** Physical-goods categories on homepage (Cars, Tech, …) — exclude services & other verticals. */
export function isPhysicalHomeCategoryListing(item: {
  type?: string | null;
}): boolean {
  const t = item.type || "physical";
  return t === "physical";
}
