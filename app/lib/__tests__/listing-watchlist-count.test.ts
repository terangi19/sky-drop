import { describe, it, expect } from "vitest";
import { listingWatchlistCount, listingWatchlistGlowIntensity } from "../listing-watchlist-count";

describe("listingWatchlistCount", () => {
  it("returns 0 for null/undefined", () => {
    expect(listingWatchlistCount(null)).toBe(0);
    expect(listingWatchlistCount(undefined)).toBe(0);
  });

  it("returns 0 when watchlistCount is missing", () => {
    expect(listingWatchlistCount({})).toBe(0);
  });

  it("returns the numeric value", () => {
    expect(listingWatchlistCount({ watchlistCount: 5 })).toBe(5);
    expect(listingWatchlistCount({ watchlistCount: 100 })).toBe(100);
  });

  it("floors fractional values", () => {
    expect(listingWatchlistCount({ watchlistCount: 5.7 })).toBe(5);
  });

  it("clamps negative values to 0", () => {
    expect(listingWatchlistCount({ watchlistCount: -3 })).toBe(0);
  });

  it("parses string values", () => {
    expect(listingWatchlistCount({ watchlistCount: "10" })).toBe(10);
    expect(listingWatchlistCount({ watchlistCount: "abc" })).toBe(0);
  });

  it("returns 0 for non-finite numbers", () => {
    expect(listingWatchlistCount({ watchlistCount: Infinity })).toBe(0);
    expect(listingWatchlistCount({ watchlistCount: NaN })).toBe(0);
  });
});

describe("listingWatchlistGlowIntensity", () => {
  it("returns 0 for count <= 0", () => {
    expect(listingWatchlistGlowIntensity(0)).toBe(0);
    expect(listingWatchlistGlowIntensity(-5)).toBe(0);
  });

  it("returns a value between 0 and 1 for positive counts", () => {
    const intensity = listingWatchlistGlowIntensity(5);
    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThanOrEqual(1);
  });

  it("caps at 1 for high counts", () => {
    expect(listingWatchlistGlowIntensity(20)).toBe(1);
    expect(listingWatchlistGlowIntensity(100)).toBe(1);
  });

  it("increases with higher count", () => {
    const low = listingWatchlistGlowIntensity(1);
    const mid = listingWatchlistGlowIntensity(5);
    const high = listingWatchlistGlowIntensity(15);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });
});
