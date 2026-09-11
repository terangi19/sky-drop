import { describe, expect, it } from "vitest";
import { isViewsOnlyListingUpdate } from "../functions/src/listing-update-filter";

describe("isViewsOnlyListingUpdate", () => {
  it("returns true when only views changed", () => {
    expect(
      isViewsOnlyListingUpdate(
        { title: "Mazda", price: 11000, views: 4 },
        { title: "Mazda", price: 11000, views: 5 }
      )
    ).toBe(true);
  });

  it("returns true when views is the only new key", () => {
    expect(
      isViewsOnlyListingUpdate(
        { title: "Mazda", price: 11000 },
        { title: "Mazda", price: 11000, views: 1 }
      )
    ).toBe(true);
  });

  it("returns false when price also dropped", () => {
    expect(
      isViewsOnlyListingUpdate(
        { title: "Mazda", price: 12000, views: 4 },
        { title: "Mazda", price: 11000, views: 5 }
      )
    ).toBe(false);
  });

  it("returns false when title changed", () => {
    expect(
      isViewsOnlyListingUpdate(
        { title: "Mazda", views: 4 },
        { title: "Mazda Axela", views: 5 }
      )
    ).toBe(false);
  });
});
