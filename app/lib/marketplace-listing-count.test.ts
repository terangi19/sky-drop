import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  formatMarketplaceListingCount,
  isAuthoritativeListingSnapshot,
  listingCountSequenceFlashedZero,
  resolvedMarketplaceListingCount,
  shouldShowMarketplaceEmptyState,
  assertAuthoritativeListingSnapshot,
  isListingSnapshotNotAuthoritative,
  LISTING_SNAPSHOT_NOT_AUTHORITATIVE,
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

describe("shouldShowMarketplaceEmptyState", () => {
  it("hides empty-category copy while the count is still unknown", () => {
    expect(shouldShowMarketplaceEmptyState(null)).toBe(false);
  });

  it("shows empty-category copy only for a settled known zero", () => {
    expect(shouldShowMarketplaceEmptyState(0)).toBe(true);
    expect(shouldShowMarketplaceEmptyState(3)).toBe(false);
  });
});

describe("assertAuthoritativeListingSnapshot", () => {
  it("throws a stable error for cached empty so callers keep loading", () => {
    expect(() =>
      assertAuthoritativeListingSnapshot({
        size: 0,
        metadata: { fromCache: true },
      })
    ).toThrow(LISTING_SNAPSHOT_NOT_AUTHORITATIVE);
    expect(
      isListingSnapshotNotAuthoritative(new Error(LISTING_SNAPSHOT_NOT_AUTHORITATIVE))
    ).toBe(true);
  });

  it("allows a server empty snapshot as a real zero", () => {
    expect(() =>
      assertAuthoritativeListingSnapshot({
        size: 0,
        metadata: { fromCache: false },
      })
    ).not.toThrow();
  });
});

describe("marketplace fetch paths ignore cached-empty getDocs", () => {
  it.each([
    "app/page.tsx",
    "app/components/BrowseCategoryPage.tsx",
    "app/useListings.ts",
    "app/rentals/page.tsx",
    "app/services/page.tsx",
    "app/wanted/page.tsx",
  ])("%s does not treat a cached-empty snapshot as loaded", (file) => {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    expect(src).toMatch(/assertAuthoritativeListingSnapshot|isAuthoritativeListingSnapshot/);
    expect(src).toMatch(/isListingSnapshotNotAuthoritative|listing-snapshot-not-authoritative/);
  });
});
