import { describe, it, expect } from "vitest";
import { isDemoListing } from "../marketplace-display";

describe("isDemoListing", () => {
  it("returns false for empty title", () => {
    expect(isDemoListing({ title: "" })).toBe(false);
    expect(isDemoListing({})).toBe(false);
  });

  it('detects "test" as demo', () => {
    expect(isDemoListing({ title: "test" })).toBe(true);
    expect(isDemoListing({ title: "Test" })).toBe(true);
    expect(isDemoListing({ title: "TEST" })).toBe(true);
  });

  it('detects "test N" pattern as demo', () => {
    expect(isDemoListing({ title: "test 1" })).toBe(true);
    expect(isDemoListing({ title: "Test 42" })).toBe(true);
    expect(isDemoListing({ title: "test123" })).toBe(true);
  });

  it('detects "test listing" prefix as demo', () => {
    expect(isDemoListing({ title: "test listing" })).toBe(true);
    expect(isDemoListing({ title: "test listing for review" })).toBe(true);
  });

  it("detects short placeholder titles as demo", () => {
    expect(isDemoListing({ title: "placeholder item" })).toBe(true);
  });

  it("does not flag long placeholder titles", () => {
    expect(isDemoListing({ title: "this is a placeholder item with a long title that is valid" })).toBe(false);
  });

  it("does not flag real listings", () => {
    expect(isDemoListing({ title: "2007 BMW 335i — Black" })).toBe(false);
    expect(isDemoListing({ title: "iPhone 15 Pro Max" })).toBe(false);
    expect(isDemoListing({ title: "Testing Equipment for Sale" })).toBe(false);
  });
});
