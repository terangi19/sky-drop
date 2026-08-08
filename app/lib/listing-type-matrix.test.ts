import { describe, expect, it } from "vitest";
import {
  formatListingPriceDisplay,
  formatWantedBudget,
  formatRentalRate,
  listingPrimaryCtaLabel,
  resolveRentalRatePeriod,
} from "./listing-price-display";
import {
  getComparableListingPrice,
  listingMatchesPriceFilter,
  listingMatchesConditionFilter,
  listingSupportsCondition,
  listingSupportsSaleType,
} from "./listing-search-filters";
import {
  messageCtaLabel,
  emptyListCtaLabel,
  categoriesForListingType,
  WANTED_LISTING_CATEGORIES,
  isMessagingOnlyListingType,
} from "./listing-type-config";
import { validateListingForPublish, clearCrossTypeFields } from "./listing-validation";
import { normalizeServicePricingType, formatServicePriceDisplay } from "./service-pricing";
import { normalizeSkyAiListingFill } from "./sky-ai-listing-fill";

describe("wanted price/budget/CTA", () => {
  it("formats budget not sale price", () => {
    expect(formatWantedBudget({ type: "wanted", price: "500" })).toBe("Budget: Up to $500");
    expect(formatListingPriceDisplay({ type: "wanted", price: "500" })).toBe("Budget: Up to $500");
  });
  it("wanted CTA is responder", () => {
    expect(messageCtaLabel("wanted")).toBe("I Can Help");
    expect(listingPrimaryCtaLabel({ type: "wanted", price: "500" })).toBe("I Can Help");
    expect(isMessagingOnlyListingType("wanted")).toBe(true);
  });
  it("wanted categories are canonical", () => {
    expect(categoriesForListingType("wanted")).toEqual([...WANTED_LISTING_CATEGORIES]);
    expect(emptyListCtaLabel("wanted")).toMatch(/looking for/i);
  });
});

describe("rental rate periods", () => {
  it("daily invariant when only price set", () => {
    expect(resolveRentalRatePeriod({ type: "rental", price: "80", rentalSubType: "equipment" })).toBe("day");
    expect(formatRentalRate({ type: "rental", price: "80", rentalSubType: "equipment" })).toBe("$80 / day");
  });
  it("supports hour week month", () => {
    expect(formatRentalRate({ type: "rental", price: "25", rentalRatePeriod: "hour" })).toBe("$25 / hour");
    expect(
      formatRentalRate({ type: "rental", rentalSubType: "property", rentalPriceWeekly: "520" })
    ).toBe("$520 / week");
  });
});

describe("search filter helpers", () => {
  it("quote service is not comparable $0", () => {
    expect(
      getComparableListingPrice({ type: "service", servicePricingType: "request_quote" })
    ).toBeNull();
    expect(
      listingMatchesPriceFilter(
        { type: "service", servicePricingType: "request_quote" },
        "10",
        "100"
      )
    ).toBe(true);
  });
  it("condition filter skips services/wanted", () => {
    expect(listingSupportsCondition("service")).toBe(false);
    expect(listingSupportsCondition("wanted")).toBe(false);
    expect(listingSupportsSaleType("rental")).toBe(false);
    expect(
      listingMatchesConditionFilter({ type: "service", condition: "New" }, "Used")
    ).toBe(true);
  });
  it("price filter uses comparable amounts", () => {
    expect(
      listingMatchesPriceFilter({ type: "physical", price: "50" }, "10", "100")
    ).toBe(true);
    expect(
      listingMatchesPriceFilter({ type: "physical", price: "500" }, "10", "100")
    ).toBe(false);
    expect(
      listingMatchesPriceFilter({ type: "wanted", price: "400" }, undefined, "500")
    ).toBe(true);
  });
});

describe("validation matrix", () => {
  it("service quote allows blank price", () => {
    const r = validateListingForPublish({
      type: "service",
      title: "Custom renovation",
      description: "Scoped jobs",
      location: "Auckland",
      servicePricingType: "request_quote",
    });
    expect(r.ok).toBe(true);
  });
  it("vehicle requires essentials", () => {
    const r = validateListingForPublish({
      type: "vehicle",
      title: "BMW",
      description: "Nice car",
      price: "8500",
      location: "Auckland",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /make|model|year/i.test(e))).toBe(true);
  });
  it("wanted requires budget not condition", () => {
    const r = validateListingForPublish({
      type: "wanted",
      title: "Wanted: PS5",
      price: "500",
    });
    expect(r.ok).toBe(true);
  });
  it("clears rental fields when switching to physical", () => {
    const cleared = clearCrossTypeFields("physical", {
      title: "Trailer",
      rentalDeposit: "200",
      rentalSubType: "equipment",
      price: "5000",
    });
    expect(cleared.rentalDeposit).toBeUndefined();
    expect(cleared.price).toBe("5000");
  });
});

describe("service from-price", () => {
  it("starting_from is from not hourly", () => {
    expect(normalizeServicePricingType("starting_from", "80")).toBe("from");
    expect(formatServicePriceDisplay({ price: "80", servicePricingType: "from" })).toBe("From $80");
  });
});

describe("Āwhina classification matrix", () => {
  it("lawn mowing $50 → SERVICE", () => {
    expect(
      normalizeSkyAiListingFill({ title: "Lawn mowing $50", price: "50" })?.listingType
    ).toBe("service");
  });
  it("photographer $120/hour → SERVICE", () => {
    expect(
      normalizeSkyAiListingFill({
        title: "Photographer $120/hour",
        price: "120",
      })?.listingType
    ).toBe("service");
  });
  it("rent trailer $60/day → RENTAL", () => {
    expect(
      normalizeSkyAiListingFill({
        title: "Trailer hire $60/day",
        description: "Rent trailer $60/day",
        price: "60",
      })?.listingType
    ).toBe("rental");
  });
  it("sell trailer $5000 → PHYSICAL", () => {
    expect(
      normalizeSkyAiListingFill({
        title: "Trailer for sale $5000",
        description: "Sell trailer $5000",
        price: "5000",
      })?.listingType
    ).toBe("physical");
  });
  it("sell 2012 BMW 320i for 8500 → VEHICLE", () => {
    const fill = normalizeSkyAiListingFill({
      title: "2012 BMW 320i automatic",
      description: "sell my 2012 BMW 320i automatic for 8500",
      price: "8500",
      vehicleMake: "BMW",
      vehicleModel: "320i",
      vehicleYear: "2012",
    });
    expect(fill?.listingType).toBe("vehicle");
  });
  it("looking for PS5 under $500 → wanted when typed", () => {
    const fill = normalizeSkyAiListingFill({
      title: "Wanted: PS5",
      description: "looking for PS5 under $500",
      price: "500",
      listingType: "wanted",
    });
    expect(fill?.listingType).toBe("wanted");
  });
});

describe("CTA consistency", () => {
  it("central labels", () => {
    expect(listingPrimaryCtaLabel({ type: "physical" })).toBe("Message Seller");
    expect(listingPrimaryCtaLabel({ type: "vehicle" })).toBe("Message Seller");
    expect(listingPrimaryCtaLabel({ type: "service", servicePricingType: "fixed", price: "50" })).toBe(
      "Message Provider"
    );
    expect(listingPrimaryCtaLabel({ type: "rental" })).toBe("Message Owner");
  });
});
