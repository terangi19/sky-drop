/**
 * Type-aware search filter helpers.
 * Quote services are NOT treated as $0; mixed results skip inapplicable filters.
 */

import {
  listingSupportsCondition,
  listingSupportsPriceFilter,
  listingSupportsSaleType,
} from "./listing-type-config";
import { normalizeServicePricingType } from "./service-pricing";
import { resolveRentalRatePeriod } from "./listing-price-display";

export type SearchListingFields = {
  type?: string | null;
  price?: string | number | null;
  pricingType?: string | null;
  servicePricingType?: string | null;
  condition?: string | null;
  saleType?: string | null;
  rentalSubType?: string | null;
  rentalRatePeriod?: string | null;
  rentalPriceWeekly?: string | number | null;
  rentalPriceMonthly?: string | number | null;
  rentalPriceHourly?: string | number | null;
};

function parseMoney(value: string | number | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric amount comparable for min/max filters.
 * Returns null when the listing has no comparable price (e.g. quote-required service).
 * Never returns 0 for blank quote prices.
 */
export function getComparableListingPrice(listing: SearchListingFields): number | null {
  const type = (listing.type || "physical").toLowerCase();

  if (type === "service") {
    const pricing = normalizeServicePricingType(
      listing.servicePricingType || listing.pricingType,
      listing.price
    );
    if (pricing === "request_quote") return null;
    return parseMoney(listing.price);
  }

  if (type === "rental" || type === "property") {
    const period = resolveRentalRatePeriod(listing);
    if (period === "week") {
      return parseMoney(listing.rentalPriceWeekly) ?? parseMoney(listing.price);
    }
    if (period === "month") {
      return parseMoney(listing.rentalPriceMonthly) ?? parseMoney(listing.price);
    }
    if (period === "hour") {
      return parseMoney(listing.rentalPriceHourly) ?? parseMoney(listing.price);
    }
    return (
      parseMoney(listing.price) ??
      parseMoney(listing.rentalPriceWeekly) ??
      parseMoney(listing.rentalPriceMonthly)
    );
  }

  if (type === "wanted") {
    const n = parseMoney(listing.price);
    if (n == null || n <= 0) return null;
    return n;
  }

  if (listing.pricingType === "quote") return null;

  return parseMoney(listing.price);
}

export {
  listingSupportsCondition,
  listingSupportsSaleType,
  listingSupportsPriceFilter,
};

/**
 * Does this listing pass min/max price filters?
 * Listings without a comparable price (quotes) always pass — never hide as $0.
 */
export function listingMatchesPriceFilter(
  listing: SearchListingFields,
  minPrice?: string | number | null,
  maxPrice?: string | number | null
): boolean {
  const minRaw =
    minPrice != null && String(minPrice).trim() !== "" ? Number(minPrice) : null;
  const maxRaw =
    maxPrice != null && String(maxPrice).trim() !== "" ? Number(maxPrice) : null;
  const hasMin = minRaw != null && Number.isFinite(minRaw);
  const hasMax = maxRaw != null && Number.isFinite(maxRaw);

  if (!hasMin && !hasMax) return true;
  if (!listingSupportsPriceFilter(listing.type)) return true;

  const comparable = getComparableListingPrice(listing);
  if (comparable == null) return true;

  if (hasMin && comparable < (minRaw as number)) return false;
  if (hasMax && comparable > (maxRaw as number)) return false;
  return true;
}

export function listingMatchesConditionFilter(
  listing: SearchListingFields,
  condition?: string | null
): boolean {
  if (!condition || condition === "all") return true;
  if (!listingSupportsCondition(listing.type)) return true;
  return (listing.condition || "") === condition;
}

export function listingMatchesSaleTypeFilter(
  listing: SearchListingFields,
  saleType?: string | null
): boolean {
  if (!saleType || saleType === "all") return true;
  if (!listingSupportsSaleType(listing.type)) return true;
  if (saleType === "auction") {
    return listing.saleType === "auction" || listing.saleType === "auction_buy_now";
  }
  return listing.saleType === saleType;
}

export function listingMatchesServicePricingFilter(
  listing: SearchListingFields,
  pricingModel?: string | null
): boolean {
  if (!pricingModel || pricingModel === "all") return true;
  if ((listing.type || "").toLowerCase() !== "service") return true;
  const normalized = normalizeServicePricingType(
    listing.servicePricingType || listing.pricingType,
    listing.price
  );
  return normalized === pricingModel;
}

export function listingMatchesRentalRatePeriodFilter(
  listing: SearchListingFields,
  period?: string | null
): boolean {
  if (!period || period === "all") return true;
  const t = (listing.type || "").toLowerCase();
  if (t !== "rental" && t !== "property") return true;
  return resolveRentalRatePeriod(listing) === period;
}
