import { describe, expect, it } from "vitest";
import {
  formatMarketplaceListingCount,
  isAuthoritativeListingSnapshot,
  listingCountSequenceFlashedZero,
  resolvedMarketplaceListingCount,
} from "./marketplace-listing-count";

describe("resolvedMarketplaceListingCount", () => {
  it("does not treat the initial empty array as a real 0 while loading", () => {
    expect(
      resolvedMarketplaceListingCount({ loading: true, count: 0 })
    ).toBeNull();
  });

  it("returns a genuine 0 after loading has settled", () => {
    expect(
      resolvedMarketplaceListingCount({ loading: false, count: 0 })
    ).toBe(0);
  });

  it("returns the loaded count once the fetch resolves", () => {
    expect(
      resolvedMarketplaceListingCount({ loading: false, count: 42 })
    ).toBe(42);
  });

  it("keeps the previous known count while a refresh is in flight", () => {
    expect(
      resolvedMarketplaceListingCount({
        loading: true,
        count: 0,
        previousKnownCount: 18,
      })
    ).toBe(18);
  });
});

describe("formatMarketplaceListingCount", () => {
  it("returns null while the count is unknown so UI can stay in loading/skeleton", () => {
    expect(formatMarketplaceListingCount(null)).toBeNull();
  });

  it("formats 0 only when the count is known", () => {
    expect(formatMarketplaceListingCount(0)).toBe("0 listings");
  });

  it("uses singular for exactly one listing", () => {
    expect(formatMarketplaceListingCount(1)).toBe("1 listing");
    expect(
      formatMarketplaceListingCount(1, { singular: "vehicle", plural: "vehicles" })
    ).toBe("1 vehicle");
  });

  it("uses plural for Cars-style vehicle counts", () => {
    expect(
      formatMarketplaceListingCount(7, { singular: "vehicle", plural: "vehicles" })
    ).toBe("7 vehicles");
  });
});

describe("isAuthoritativeListingSnapshot", () => {
  it("rejects a cached empty snapshot so Cars/browse does not flash 0", () => {
    expect(
      isAuthoritativeListingSnapshot({
        size: 0,
        metadata: { fromCache: true },
      })
    ).toBe(false);
  });

  it("accepts a server empty snapshot as a real zero", () => {
    expect(
      isAuthoritativeListingSnapshot({
        size: 0,
        metadata: { fromCache: false },
      })
    ).toBe(true);
  });

  it("accepts a cached non-empty snapshot so we can show a known count immediately", () => {
    expect(
      isAuthoritativeListingSnapshot({
        size: 12,
        metadata: { fromCache: true },
      })
    ).toBe(true);
  });
});

describe("listingCountSequenceFlashedZero", () => {
  it("flags the pre-fix homepage animation 0 → N", () => {
    expect(listingCountSequenceFlashedZero(["0", "12", "42"])).toBe(true);
    expect(listingCountSequenceFlashedZero(["0", "42"])).toBe(true);
  });

  it("allows loading then the real count", () => {
    expect(listingCountSequenceFlashedZero(["loading", "42"])).toBe(false);
  });

  it("allows a genuine empty marketplace after load", () => {
    expect(listingCountSequenceFlashedZero(["loading", "0"])).toBe(false);
  });

  it("allows Cars filter changing a known count without passing through 0", () => {
    expect(listingCountSequenceFlashedZero(["loading", "40", "8"])).toBe(false);
  });
});
