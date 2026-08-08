import { describe, expect, it } from "vitest";
import { normalizeSkyAiListingFill } from "./sky-ai-listing-fill";
import {
  formatRentalRate,
  formatServicePrice,
  formatListingPriceDisplay,
  listingPrimaryCtaLabel,
} from "./listing-price-display";
import {
  RENTAL_LISTING_CATEGORY_LIST,
  SERVICE_LISTING_CATEGORY_LIST,
  browseFilterCategories,
  messageCtaLabel,
} from "./listing-type-config";
import { normalizeServicePricingType } from "./service-pricing";
import { buildListingSearchBlob, scoreListingMatch } from "./marketplace-fuzzy-search";

describe("Āwhina sell vs service vs rental classification", () => {
  it("lawn mowing $50 → SERVICE", () => {
    const fill = normalizeSkyAiListingFill({
      title: "Lawn mowing $50",
      description: "Lawn mowing around Hamilton $50",
      price: "50",
    });
    expect(fill?.listingType).toBe("service");
    expect(fill?.category).toBe("Trades & Repairs");
    expect(fill?.servicePricingType).toBe("fixed");
  });

  it("photographer $120/hour → SERVICE hourly", () => {
    const fill = normalizeSkyAiListingFill({
      title: "Photographer $120/hour",
      description: "Event photographer $120/hour Auckland",
      price: "120",
    });
    expect(fill?.listingType).toBe("service");
    expect(fill?.category).toBe("Photography");
    expect(fill?.servicePricingType).toBe("hourly");
  });

  it("rent trailer $60/day → RENTAL", () => {
    const fill = normalizeSkyAiListingFill({
      title: "Trailer hire $60/day",
      description: "Rent trailer $60/day $200 bond Dunedin",
      price: "60",
      rentalDeposit: "200",
    });
    expect(fill?.listingType).toBe("rental");
    expect(fill?.category).toBe("Vehicles");
    expect(fill?.price).toBe("60");
  });

  it("sell pressure washer $300 → PHYSICAL", () => {
    const fill = normalizeSkyAiListingFill({
      title: "Pressure washer $300",
      description: "Sell pressure washer $300 good condition",
      price: "300",
    });
    expect(fill?.listingType).toBe("physical");
    expect(fill?.listingType).not.toBe("service");
    expect(fill?.listingType).not.toBe("rental");
  });

  it("/hour is service labour, /day is rental hire", () => {
    expect(
      normalizeSkyAiListingFill({
        title: "Handyman $80/hour",
        price: "80",
      })?.listingType
    ).toBe("service");
    expect(
      normalizeSkyAiListingFill({
        title: "Generator hire $80/day",
        price: "80",
      })?.listingType
    ).toBe("rental");
  });
});

describe("pricing display helpers", () => {
  it("formatServicePrice shows fixed and hourly", () => {
    expect(formatServicePrice({ price: "50", servicePricingType: "fixed" })).toBe("$50");
    expect(formatServicePrice({ price: "120", servicePricingType: "hourly" })).toBe("$120 / hr");
    expect(formatServicePrice({ servicePricingType: "request_quote" })).toMatch(/quote/i);
  });

  it("formatRentalRate shows $80 / day", () => {
    expect(formatRentalRate({ type: "rental", price: "80", rentalSubType: "equipment" })).toBe(
      "$80 / day"
    );
    expect(
      formatRentalRate({
        type: "rental",
        rentalSubType: "property",
        rentalPriceWeekly: "520",
      })
    ).toBe("$520 / week");
  });

  it("listingPrimaryCtaLabel is messaging-first", () => {
    expect(listingPrimaryCtaLabel({ type: "service", price: "50", servicePricingType: "fixed" })).toBe(
      "Message Provider"
    );
    expect(listingPrimaryCtaLabel({ type: "rental" })).toBe("Message Owner");
    expect(listingPrimaryCtaLabel({ type: "physical" })).toBe("Message Seller");
    expect(messageCtaLabel("service")).toBe("Message Provider");
  });

  it("normalizeServicePricingType detects /hour", () => {
    expect(normalizeServicePricingType(undefined, "120", "photographer $120/hour")).toBe("hourly");
  });
});

describe("category source of truth", () => {
  it("browse filters include create-flow categories", () => {
    expect(browseFilterCategories("service")).toEqual(["All", ...SERVICE_LISTING_CATEGORY_LIST]);
    expect(browseFilterCategories("rental")).toEqual(["All", ...RENTAL_LISTING_CATEGORY_LIST]);
    expect(RENTAL_LISTING_CATEGORY_LIST).toContain("Property");
    expect(RENTAL_LISTING_CATEGORY_LIST).toContain("Equipment");
  });
});

describe("global search includes services/rentals", () => {
  it("scores photographer and trailer rental queries against typed listings", () => {
    const service = {
      id: "1",
      title: "Wedding photographer",
      description: "Portraits and events",
      category: "Photography",
      type: "service",
    };
    const rental = {
      id: "2",
      title: "Single axle trailer",
      description: "Trailer hire daily",
      category: "Vehicles",
      type: "rental",
      rentalSubType: "equipment",
    };
    const physical = {
      id: "3",
      title: "Phone case",
      description: "Clear case",
      category: "Tech",
      type: "physical",
    };

    expect(buildListingSearchBlob(service)).toContain("service");
    expect(buildListingSearchBlob(rental)).toContain("rental");
    expect(scoreListingMatch(service, "photographer auckland")).toBeGreaterThan(
      scoreListingMatch(physical, "photographer auckland")
    );
    expect(scoreListingMatch(rental, "trailer rental")).toBeGreaterThan(
      scoreListingMatch(physical, "trailer rental")
    );
    expect(formatListingPriceDisplay({ type: "rental", price: "60" })).toBe("$60 / day");
  });
});
