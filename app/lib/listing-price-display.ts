/**
 * Type-aware listing price display for cards, browse, search, and detail.
 * Reuses supported schema fields only — no invented rate models.
 */

import {
  DEFAULT_RENTAL_RATE_PERIOD,
  messageCtaLabel,
  type RentalRatePeriod,
} from "./listing-type-config";
import {
  formatServicePriceDisplay,
  normalizeServicePricingType,
} from "./service-pricing";

export type ListingPriceFields = {
  type?: string | null;
  price?: string | number | null;
  pricingType?: string | null;
  servicePricingType?: string | null;
  rentalSubType?: string | null;
  rentalRatePeriod?: string | null;
  rentalPriceWeekly?: string | number | null;
  rentalPriceMonthly?: string | number | null;
  rentalPriceHourly?: string | number | null;
  rentalDeposit?: string | number | null;
  rentalAvailableDate?: string | null;
};

function money(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const n = Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return String(value).replace(/^$/, "");
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function periodLabel(period: RentalRatePeriod): string {
  switch (period) {
    case "hour":
      return "hour";
    case "week":
      return "week";
    case "month":
      return "month";
    case "day":
    default:
      return "day";
  }
}

/** Resolve rental rate period. Equipment/vehicle default: daily when only `price` is set. */
export function resolveRentalRatePeriod(listing: ListingPriceFields): RentalRatePeriod {
  const raw = (listing.rentalRatePeriod || "").toLowerCase().trim();
  if (raw === "hour" || raw === "hourly" || raw === "/hour" || raw === "/hr") return "hour";
  if (raw === "week" || raw === "weekly" || raw === "/week") return "week";
  if (raw === "month" || raw === "monthly" || raw === "/month") return "month";
  if (raw === "day" || raw === "daily" || raw === "/day") return "day";

  const sub = (listing.rentalSubType || "").toLowerCase();
  if (sub === "property") {
    if (money(listing.rentalPriceWeekly)) return "week";
    if (money(listing.rentalPriceMonthly)) return "month";
  }
  if (money(listing.rentalPriceHourly) && !money(listing.price)) return "hour";
  return DEFAULT_RENTAL_RATE_PERIOD;
}

/** Alias — service fixed / hourly / from / quote. */
export function formatServicePrice(listing: ListingPriceFields): string {
  return formatServicePriceDisplay({
    price: listing.price,
    servicePricingType: listing.servicePricingType || listing.pricingType,
  });
}

/** Alias — rental rate with period, e.g. "$80 / day". */
export function formatRentalRate(listing: ListingPriceFields): string {
  return formatRentalPriceDisplay(listing);
}

/** Wanted budget line — never "Price: $X". */
export function formatWantedBudget(listing: ListingPriceFields): string {
  const p = money(listing.price);
  if (!p || p === "0") return "Budget on request";
  return `Budget: Up to $${p}`;
}

/** Primary price line. */
export function formatListingPriceDisplay(listing: ListingPriceFields): string {
  const type = (listing.type || "physical").toLowerCase();

  if (type === "wanted") return formatWantedBudget(listing);
  if (type === "service") return formatServicePrice(listing);
  if (type === "rental" || type === "property") return formatRentalRate(listing);

  if (listing.pricingType === "quote") return "Contact Seller for Quote";
  const p = money(listing.price);
  return p ? `$${p}` : "Price on request";
}

export function formatRentalPriceDisplay(listing: ListingPriceFields): string {
  const weekly = money(listing.rentalPriceWeekly);
  const monthly = money(listing.rentalPriceMonthly);
  const hourly = money(listing.rentalPriceHourly);
  const primary = money(listing.price);
  const sub = (listing.rentalSubType || "").toLowerCase();
  const period = resolveRentalRatePeriod(listing);

  if (sub === "property" || (weekly && !primary && period !== "day" && period !== "hour")) {
    if (weekly) return `$${weekly} / week`;
    if (monthly) return `$${monthly} / month`;
    if (primary) return `$${primary} / ${periodLabel(period)}`;
    return "Rate on request";
  }

  if (period === "hour") {
    const amt = hourly || primary;
    return amt ? `$${amt} / hour` : "Rate on request";
  }
  if (period === "week") {
    const amt = weekly || primary;
    return amt ? `$${amt} / week` : "Rate on request";
  }
  if (period === "month") {
    const amt = monthly || primary;
    return amt ? `$${amt} / month` : "Rate on request";
  }

  if (primary) return `$${primary} / day`;
  if (weekly) return `$${weekly} / week`;
  if (monthly) return `$${monthly} / month`;
  if (hourly) return `$${hourly} / hour`;
  return "Rate on request";
}

export function formatListingPriceMeta(listing: ListingPriceFields): string {
  const type = (listing.type || "").toLowerCase();
  const parts: string[] = [];

  if (type === "wanted") {
    return "Wanted";
  }

  if (type === "rental" || type === "property") {
    const deposit = money(listing.rentalDeposit);
    if (deposit) parts.push(`$${deposit} bond`);
    if (listing.rentalAvailableDate) {
      parts.push(`Available ${listing.rentalAvailableDate}`);
    }
    const sub = (listing.rentalSubType || "").toLowerCase();
    const weekly = money(listing.rentalPriceWeekly);
    const monthly = money(listing.rentalPriceMonthly);
    const daily = money(listing.price);
    const period = resolveRentalRatePeriod(listing);
    if (sub !== "property" && daily && weekly && period === "day") {
      parts.push(`$${weekly}/wk`);
    }
    if (sub !== "property" && daily && monthly && period === "day") {
      parts.push(`$${monthly}/mo`);
    }
  }

  if (type === "service") {
    const pricing = normalizeServicePricingType(
      listing.servicePricingType || listing.pricingType,
      listing.price
    );
    if (pricing === "hourly") parts.push("Hourly");
    else if (pricing === "from") parts.push("From");
    else if (pricing === "request_quote") parts.push("Quote required");
    else if (pricing === "fixed") parts.push("Fixed price");
  }

  return parts.join(" · ");
}

export function listingPrimaryCtaLabel(listing: {
  type?: string | null;
  pricingType?: string | null;
  servicePricingType?: string | null;
  price?: string | number | null;
}): string {
  const type = (listing.type || "").toLowerCase();
  if (type === "service") {
    const pricing = normalizeServicePricingType(
      listing.servicePricingType || listing.pricingType,
      listing.price
    );
    if (pricing === "request_quote") return "Request Quote";
    return messageCtaLabel("service");
  }
  if (type === "rental" || type === "property") return messageCtaLabel("rental");
  if (type === "wanted") return messageCtaLabel("wanted");
  if (listing.pricingType === "quote") return "Request Quote";
  return messageCtaLabel(type || "physical");
}

/** Edit/create form label for the primary amount field (price / rate / budget). */
export function listingAmountFieldLabel(listing: {
  type?: string | null;
  servicePricingType?: string | null;
  pricingType?: string | null;
  rentalSubType?: string | null;
}): string {
  const type = (listing.type || "physical").toLowerCase();
  if (type === "wanted") return "Budget ($)";
  if (type === "service") {
    const pricing = normalizeServicePricingType(
      listing.servicePricingType || listing.pricingType,
      null
    );
    if (pricing === "hourly") return "Hourly rate ($)";
    if (pricing === "request_quote") return "Indicative price ($ optional)";
    return "Service price ($)";
  }
  if (type === "rental" || type === "property") {
    const sub = (listing.rentalSubType || "").toLowerCase();
    if (sub === "property" || type === "property") return "Weekly rent ($)";
    return "Rental rate ($)";
  }
  if (type === "vehicle") return "Sale price ($)";
  return "Price ($)";
}
