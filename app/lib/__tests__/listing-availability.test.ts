import { describe, it, expect } from "vitest";
import {
  listingTracksStock,
  listingStockCount,
  isListingVisibleInMarketplace,
  isListingAvailableForPurchase,
  formatStockLabel,
} from "../listing-availability";

describe("listingTracksStock", () => {
  it("returns false for null/undefined stockQuantity", () => {
    expect(listingTracksStock({})).toBe(false);
    expect(listingTracksStock({ stockQuantity: null })).toBe(false);
    expect(listingTracksStock({ stockQuantity: undefined })).toBe(false);
  });

  it("returns false for empty string stockQuantity", () => {
    expect(listingTracksStock({ stockQuantity: "" })).toBe(false);
  });

  it("returns true for numeric stockQuantity", () => {
    expect(listingTracksStock({ stockQuantity: 5 })).toBe(true);
    expect(listingTracksStock({ stockQuantity: 0 })).toBe(true);
  });

  it("returns true for string numeric stockQuantity", () => {
    expect(listingTracksStock({ stockQuantity: "10" })).toBe(true);
  });
});

describe("listingStockCount", () => {
  it("returns null when stock is not tracked", () => {
    expect(listingStockCount({})).toBeNull();
    expect(listingStockCount({ stockQuantity: null })).toBeNull();
  });

  it("returns numeric value for valid stock", () => {
    expect(listingStockCount({ stockQuantity: 5 })).toBe(5);
    expect(listingStockCount({ stockQuantity: "10" })).toBe(10);
    expect(listingStockCount({ stockQuantity: 0 })).toBe(0);
  });

  it("returns 0 for non-parseable string stock", () => {
    expect(listingStockCount({ stockQuantity: "abc" })).toBe(0);
  });
});

describe("isListingVisibleInMarketplace", () => {
  it("returns true for stock > 0", () => {
    expect(isListingVisibleInMarketplace({ stockQuantity: 5 })).toBe(true);
  });

  it("returns false for stock = 0", () => {
    expect(isListingVisibleInMarketplace({ stockQuantity: 0 })).toBe(false);
  });

  it('returns false for status "sold" when no stock tracked', () => {
    expect(isListingVisibleInMarketplace({ status: "sold" })).toBe(false);
  });

  it('returns true for status != "sold" when no stock tracked', () => {
    expect(isListingVisibleInMarketplace({ status: "active" })).toBe(true);
    expect(isListingVisibleInMarketplace({})).toBe(true);
  });
});

describe("isListingAvailableForPurchase", () => {
  it("returns true for stock > 0", () => {
    expect(isListingAvailableForPurchase({ stockQuantity: 3 })).toBe(true);
  });

  it("returns false for stock = 0", () => {
    expect(isListingAvailableForPurchase({ stockQuantity: 0 })).toBe(false);
  });

  it('returns false for status "sold"', () => {
    expect(isListingAvailableForPurchase({ status: "sold" })).toBe(false);
  });

  it("returns true for non-sold status without stock", () => {
    expect(isListingAvailableForPurchase({ status: "active" })).toBe(true);
  });
});

describe("formatStockLabel", () => {
  it("returns null when stock not tracked", () => {
    expect(formatStockLabel({})).toBeNull();
  });

  it('returns "Out of stock" for 0', () => {
    expect(formatStockLabel({ stockQuantity: 0 })).toBe("Out of stock");
  });

  it('returns "1 available" for stock of 1', () => {
    expect(formatStockLabel({ stockQuantity: 1 })).toBe("1 available");
  });

  it("returns plural for stock > 1", () => {
    expect(formatStockLabel({ stockQuantity: 5 })).toBe("5 available");
  });
});
