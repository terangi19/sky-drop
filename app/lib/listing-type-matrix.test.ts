import { describe, expect, it } from "vitest";
import {
  formatListingPriceDisplay,
  formatWantedBudget,
  formatRentalRate,
  listingPrimaryCtaLabel,
  listingAmountFieldLabel,
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
  PHYSICAL_LISTING_CATEGORIES,
  VEHICLE_LISTING_CATEGORIES,
  isMessagingOnlyListingType,
  listingTypeHelperDescription,
  LISTING_TYPE_HELPER_DESCRIPTIONS,
  CANONICAL_LISTING_TYPES,
  isLegacyVehicleListing,
  isCanonicalVehicleListing,
  stripInactiveVehicleSaleFields,
} from "./listing-type-config";
import { validateListingForPublish, clearCrossTypeFields } from "./listing-validation";
import { normalizeServicePricingType, formatServicePriceDisplay } from "./service-pricing";
import {
  applySkyAiListingFill,
  normalizeSkyAiListingFill,
  type ListingFillHandlers,
} from "./sky-ai-listing-fill";
import { isVehicleListingFill } from "./awhina-listing-description";
import { getListingReadinessState } from "./awhina-listing-readiness";

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
  it("amount field labels are type-aware", () => {
    expect(listingAmountFieldLabel({ type: "wanted" })).toMatch(/Budget/i);
    expect(listingAmountFieldLabel({ type: "service", servicePricingType: "hourly" })).toMatch(/Hourly/i);
    expect(listingAmountFieldLabel({ type: "rental", rentalSubType: "equipment" })).toMatch(/Rental rate/i);
    expect(listingAmountFieldLabel({ type: "rental", rentalSubType: "property" })).toMatch(/Weekly rent/i);
    expect(listingAmountFieldLabel({ type: "physical" })).toMatch(/Price/i);
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
  it("clears vehicle fields when switching to physical", () => {
    const cleared = clearCrossTypeFields("physical", {
      title: "PS5",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      vehicleYear: "2007",
      price: "450",
    });
    expect(cleared.vehicleMake).toBeUndefined();
    expect(cleared.vehicleModel).toBeUndefined();
    expect(cleared.price).toBe("450");
  });
  it("rejects new physical + Cars category", () => {
    const r = validateListingForPublish({
      type: "physical",
      title: "2015 Mazda",
      description: "Blue hatch",
      price: "11500",
      condition: "Used - Good",
      category: "Cars",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /Vehicle|Cars/i.test(e))).toBe(true);
  });
  it("allows legacy physical + Cars when flagged", () => {
    const r = validateListingForPublish({
      type: "physical",
      title: "2015 Mazda",
      description: "Blue hatch",
      price: "11500",
      condition: "Used - Good",
      category: "Cars",
      allowLegacyPhysicalCars: true,
    });
    expect(r.ok).toBe(true);
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

describe("listing type helper descriptions", () => {
  it("covers every canonical type with the UX copy", () => {
    for (const type of CANONICAL_LISTING_TYPES) {
      expect(listingTypeHelperDescription(type)).toBe(LISTING_TYPE_HELPER_DESCRIPTIONS[type]);
      expect(LISTING_TYPE_HELPER_DESCRIPTIONS[type].length).toBeGreaterThan(20);
    }
    expect(listingTypeHelperDescription("physical")).toContain("electronics");
    expect(listingTypeHelperDescription("physical")).not.toMatch(/vehicle/i);
    expect(listingTypeHelperDescription("vehicle")).toContain("motorbike");
    expect(listingTypeHelperDescription("service")).toContain("lawn mowing");
    expect(listingTypeHelperDescription("rental")).toContain("temporary use");
    expect(listingTypeHelperDescription("wanted")).toContain("looking to buy");
    expect(listingTypeHelperDescription("event")).toBeUndefined();
  });
});

describe("canonical vehicle vs physical semantics", () => {
  it("physical categories exclude Cars; vehicle owns Cars", () => {
    expect(PHYSICAL_LISTING_CATEGORIES).not.toContain("Cars");
    expect(PHYSICAL_LISTING_CATEGORIES).toEqual([
      "Tech",
      "Gaming",
      "Fashion",
      "Home",
      "Sports",
      "Other",
    ]);
    expect(categoriesForListingType("physical")).toEqual([...PHYSICAL_LISTING_CATEGORIES]);
    expect(categoriesForListingType("vehicle")).toEqual([...VEHICLE_LISTING_CATEGORIES]);
    expect(VEHICLE_LISTING_CATEGORIES).toContain("Cars");
  });

  it("legacy helper only for historical physical+Cars", () => {
    expect(isLegacyVehicleListing({ type: "physical", category: "Cars" })).toBe(true);
    expect(isLegacyVehicleListing({ type: "vehicle", category: "Cars" })).toBe(false);
    expect(isLegacyVehicleListing({ type: "physical", category: "Tech" })).toBe(false);
    expect(isCanonicalVehicleListing({ listingType: "vehicle" })).toBe(true);
    expect(isCanonicalVehicleListing({ listingType: "physical" })).toBe(false);
  });

  it("Physical + PS5 → no vehicle fields on normalize/apply", () => {
    const fill = normalizeSkyAiListingFill({
      title: "PlayStation 5",
      listingType: "physical",
      category: "Gaming",
      price: "450",
      condition: "Used - Good",
      vehicleMake: "BMW",
      vehicleModel: "335i",
    });
    expect(fill?.listingType).toBe("physical");
    expect(fill?.vehicleMake).toBeUndefined();
    expect(fill?.vehicleModel).toBeUndefined();

    const applied: Record<string, string> = {};
    const h: ListingFillHandlers = {
      setListingType: (v) => {
        applied.listingType = v;
      },
      setCategory: (v) => {
        applied.category = v;
      },
      setTitle: (v) => {
        applied.title = v;
      },
      setDescription: () => {},
      setPrice: (v) => {
        applied.price = v;
      },
      setCondition: (v) => {
        applied.condition = v;
      },
      setVehicleMake: (v) => {
        applied.vehicleMake = v;
      },
      setVehicleModel: (v) => {
        applied.vehicleModel = v;
      },
    };
    applySkyAiListingFill(
      {
        title: "PlayStation 5",
        listingType: "physical",
        category: "Gaming",
        price: "450",
        condition: "Used - Good",
      },
      h
    );
    expect(applied.listingType).toBe("physical");
    expect(applied.category).toBe("Gaming");
    expect(applied.vehicleMake).toBeUndefined();
  });

  it("Physical + iPhone → Tech, no vehicle fields", () => {
    const fill = normalizeSkyAiListingFill({
      title: "iPhone 13",
      listingType: "physical",
      category: "Tech",
      price: "600",
    });
    expect(fill?.listingType).toBe("physical");
    expect(fill?.category).toBe("Tech");
    expect(fill?.vehicleMake).toBeUndefined();
  });

  it("Vehicle + BMW → vehicle fields visible via apply", () => {
    const applied: Record<string, string> = {};
    const h: ListingFillHandlers = {
      setListingType: (v) => {
        applied.listingType = v;
      },
      setCategory: (v) => {
        applied.category = v;
      },
      setTitle: (v) => {
        applied.title = v;
      },
      setDescription: () => {},
      setPrice: (v) => {
        applied.price = v;
      },
      setCondition: () => {},
      setVehicleMake: (v) => {
        applied.vehicleMake = v;
      },
      setVehicleModel: (v) => {
        applied.vehicleModel = v;
      },
      setVehicleYear: (v) => {
        applied.vehicleYear = v;
      },
      setAcceptOffers: () => {},
      setSaleType: () => {},
    };
    applySkyAiListingFill(
      {
        title: "2007 BMW 335i",
        listingType: "vehicle",
        category: "Cars",
        price: "20000",
        vehicleMake: "BMW",
        vehicleModel: "335i",
        vehicleYear: "2007",
      },
      h
    );
    expect(applied.listingType).toBe("vehicle");
    expect(applied.category).toBe("Cars");
    expect(applied.vehicleMake).toBe("BMW");
    expect(applied.vehicleModel).toBe("335i");
  });

  it("Vehicle → Physical: vehicle fields ignored for readiness/fill checks", () => {
    expect(
      isVehicleListingFill({
        listingType: "physical",
        title: "BMW 335i",
        vehicleMake: "BMW",
        vehicleModel: "335i",
      })
    ).toBe(false);
    const state = getListingReadinessState({
      listingType: "physical",
      title: "PlayStation 5",
      price: "450",
      condition: "Used - Good",
      location: "Auckland",
      category: "Gaming",
      vehicleMake: "BMW",
      vehicleModel: "335i",
    });
    expect(state === "READY_TO_REVIEW" || state === "READY_TO_PUBLISH").toBe(true);
  });

  it("Physical → Vehicle: vehicle identity activates", () => {
    expect(
      isVehicleListingFill({
        listingType: "vehicle",
        vehicleMake: "BMW",
        vehicleModel: "335i",
      })
    ).toBe(true);
  });

  it("publish strip removes vehicle fields from physical payloads", () => {
    const stripped = stripInactiveVehicleSaleFields("physical", {
      title: "PS5",
      category: "Gaming",
      vehicleMake: "BMW",
      vehicleModel: "335i",
      vehicleYear: "2007",
      price: "450",
    });
    expect(stripped.vehicleMake).toBeUndefined();
    expect(stripped.vehicleModel).toBeUndefined();
    expect(stripped.price).toBe("450");
    expect(
      stripInactiveVehicleSaleFields("vehicle", {
        vehicleMake: "BMW",
        vehicleModel: "335i",
      }).vehicleMake
    ).toBe("BMW");
  });

  it("old physical+Cars listing still recognized via compatibility path", () => {
    expect(
      isLegacyVehicleListing({
        type: "physical",
        listingType: "physical",
        category: "Cars",
      })
    ).toBe(true);
  });
});
