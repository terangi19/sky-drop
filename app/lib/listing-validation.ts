/**
 * Type-aware create/edit validation — single source for client + API.
 */

import { servicePriceRequired, normalizeServicePricingType } from "./service-pricing";
import { RENTAL_SUB_TYPES, TYPE_ISOLATION_CLEAR_FIELDS } from "./listing-type-config";

export type ListingValidationInput = {
  type?: string | null;
  listingType?: string | null;
  title?: string | null;
  description?: string | null;
  price?: string | number | null;
  category?: string | null;
  location?: string | null;
  condition?: string | null;
  servicePricingType?: string | null;
  pricingType?: string | null;
  rentalSubType?: string | null;
  rentalRatePeriod?: string | null;
  rentalPriceWeekly?: string | number | null;
  rentalPriceMonthly?: string | number | null;
  rentalDeposit?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | number | null;
  vehicleOdometer?: string | number | null;
};

export type ListingValidationResult = {
  ok: boolean;
  errors: string[];
};

function hasText(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function hasPositiveMoney(v: unknown): boolean {
  if (!hasText(v)) return false;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0;
}

export function validateListingForPublish(input: ListingValidationInput): ListingValidationResult {
  const errors: string[] = [];
  const type = (input.listingType || input.type || "physical").toLowerCase();

  if (!hasText(input.title) || String(input.title).trim().length < 3) {
    errors.push("Title must be at least 3 characters");
  }

  if (type !== "wanted" && !hasText(input.description)) {
    errors.push("Description is required");
  }

  switch (type) {
    case "wanted": {
      if (!hasPositiveMoney(input.price)) {
        errors.push("Budget is required");
      }
      break;
    }
    case "service": {
      const pricing = normalizeServicePricingType(
        input.servicePricingType || input.pricingType,
        input.price
      );
      if (servicePriceRequired(pricing) && !hasPositiveMoney(input.price)) {
        errors.push(pricing === "hourly" ? "Hourly rate is required" : "Price is required");
      }
      if (!hasText(input.location)) {
        errors.push("Location / area is required for services");
      }
      break;
    }
    case "rental":
    case "property": {
      const sub = (input.rentalSubType || "").toLowerCase();
      if (sub && !(RENTAL_SUB_TYPES as readonly string[]).includes(sub)) {
        errors.push("Invalid rental subtype");
      }
      const isProperty = sub === "property" || type === "property";
      if (isProperty) {
        if (!hasPositiveMoney(input.rentalPriceWeekly) && !hasPositiveMoney(input.price)) {
          errors.push("Weekly rent (or rate) is required");
        }
      } else if (!hasPositiveMoney(input.price)) {
        errors.push("Rental rate is required");
      }
      if (!hasText(input.location)) {
        errors.push("Location is required for rentals");
      }
      break;
    }
    case "vehicle": {
      if (!hasText(input.vehicleMake) || !hasText(input.vehicleModel)) {
        errors.push("Vehicle make and model are required");
      }
      if (!hasText(input.vehicleYear)) {
        errors.push("Vehicle year is required");
      }
      if (!hasPositiveMoney(input.price)) {
        errors.push("Sale price is required");
      }
      if (!hasText(input.location)) {
        errors.push("Location is required");
      }
      break;
    }
    case "physical":
    default: {
      if (!hasPositiveMoney(input.price) && input.pricingType !== "quote") {
        errors.push("Sale price is required");
      }
      if (type === "physical" && !hasText(input.condition)) {
        errors.push("Condition is required");
      }
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Strip fields that must not leak when switching listing type. */
export function clearCrossTypeFields(
  targetType: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const clear = TYPE_ISOLATION_CLEAR_FIELDS[targetType] || [];
  const out = { ...data };
  for (const key of clear) {
    delete out[key];
  }
  return out;
}
