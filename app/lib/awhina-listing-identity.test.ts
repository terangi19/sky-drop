/**
 * Canonical listing identity — overlap-aware compose + adjacent-dup guard.
 */
import { describe, expect, it } from "vitest";
import {
  composeListingIdentity,
  composeListingIdentityFromSeed,
  guardAdjacentIdentityDuplication,
} from "./awhina-listing-identity";
import {
  buildPremiumListingTitle,
  normalizeProductName,
} from "./awhina-product-ux";
import { buildListingDescriptionFromFacts } from "./awhina-listing-description";
import { composeListingTitleAndDescription } from "./awhina-listing-composer";

describe("composeListingIdentity", () => {
  it("PlayStation 5 + model 5 → PlayStation 5", () => {
    expect(
      composeListingIdentity({
        brand: "PlayStation",
        product: "PlayStation 5",
        model: "5",
      })
    ).toBe("PlayStation 5");
  });

  it("iPhone 15 Pro + model 15 Pro → iPhone 15 Pro (Apple optional)", () => {
    expect(
      composeListingIdentity({
        brand: "Apple",
        product: "iPhone 15 Pro",
        model: "15 Pro",
      })
    ).toBe("Apple iPhone 15 Pro");
    expect(
      composeListingIdentity({
        product: "iPhone 15 Pro",
        model: "15 Pro",
      })
    ).toBe("iPhone 15 Pro");
  });

  it("Nissan + Skyline + R34 → Nissan Skyline R34", () => {
    expect(
      composeListingIdentity({
        brand: "Nissan",
        product: "Skyline",
        generation: "R34",
      })
    ).toBe("Nissan Skyline R34");
  });

  it("BMW 335i + model 335i → BMW 335i", () => {
    expect(
      composeListingIdentity({
        brand: "BMW",
        product: "BMW 335i",
        model: "335i",
      })
    ).toBe("BMW 335i");
    expect(
      composeListingIdentity({
        brand: "BMW",
        model: "335i",
      })
    ).toBe("BMW 335i");
  });

  it("Messi + PSA 10 → no grade duplicate", () => {
    expect(
      composeListingIdentity({
        product: "Lionel Messi Topps Chrome",
        model: "PSA 10",
      })
    ).toBe("Lionel Messi Topps Chrome PSA 10");
    expect(
      composeListingIdentity({
        product: "Lionel Messi PSA 10",
        model: "10",
      })
    ).toBe("Lionel Messi PSA 10");
    expect(
      composeListingIdentity({
        product: "Messi PSA 10",
        model: "PSA 10",
      })
    ).toBe("Messi PSA 10");
  });

  it("preserves legitimate repeated-looking names", () => {
    expect(composeListingIdentity({ product: "Jordan 1 High" })).toBe("Jordan 1 High");
    expect(composeListingIdentity({ product: "Formula 1" })).toBe("Formula 1");
    expect(composeListingIdentity({ product: "Xbox Series S" })).toBe("Xbox Series S");
    expect(
      guardAdjacentIdentityDuplication("Jordan 1 High")
    ).toBe("Jordan 1 High");
  });
});

describe("guardAdjacentIdentityDuplication", () => {
  it("collapses accidental adjacent duplicates", () => {
    expect(guardAdjacentIdentityDuplication("PlayStation 5 5")).toBe("PlayStation 5");
    expect(guardAdjacentIdentityDuplication("iPhone 15 Pro 15 Pro")).toBe("iPhone 15 Pro");
    expect(guardAdjacentIdentityDuplication("Skyline R34 R34")).toBe("Skyline R34");
    expect(guardAdjacentIdentityDuplication("BMW 335i 335i")).toBe("BMW 335i");
    expect(guardAdjacentIdentityDuplication("PSA 10 10")).toBe("PSA 10");
    expect(guardAdjacentIdentityDuplication("Nike Nike shoes")).toBe("Nike shoes");
  });
});

describe("normalize + title + description use same identity", () => {
  it("PS5 5 seed does not become PlayStation 5 5", () => {
    expect(normalizeProductName("PS5 5")).toBe("PlayStation 5");
    expect(buildPremiumListingTitle({ item: "PS5 5", condition: "New" })).toMatch(
      /^Brand New PlayStation 5/i
    );
    expect(buildPremiumListingTitle({ item: "PS5 5", condition: "New" })).not.toMatch(
      /5\s+5/
    );
  });

  it("product + model fields collapse before title", () => {
    const title = buildPremiumListingTitle({
      item: "PlayStation 5",
      model: "5",
      condition: "New",
    });
    expect(title).toMatch(/PlayStation\s*5/i);
    expect(title).not.toMatch(/5\s+5/);
  });

  it("description never echoes PlayStation 5 5", () => {
    const desc = buildListingDescriptionFromFacts({
      title: "Brand New PlayStation 5 5",
      condition: "New",
      price: "500",
      location: "Auckland",
      listingType: "physical",
      category: "Gaming",
    });
    expect(desc).toMatch(/PlayStation\s*5/i);
    expect(desc).not.toMatch(/PlayStation\s*5\s+5/i);
    expect(desc.toLowerCase()).toMatch(/for sale|asking/);
  });

  it("composer one-shot PS5 stays clean", () => {
    const c = composeListingTitleAndDescription({
      item: "PlayStation 5",
      condition: "New",
      price: "500",
      location: "Auckland",
    });
    expect(c.title).not.toMatch(/5\s+5/);
    expect(c.description).not.toMatch(/5\s+5/);
    expect(composeListingIdentityFromSeed("PlayStation 5", { model: "5" })).toBe(
      "PlayStation 5"
    );
  });
});
