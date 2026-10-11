import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { savedSearchMatchesListing } from "../app/lib/saved-search-match";

/**
 * The retired onListingCreated Cloud Function filtered saved searches by price
 * (functions/src/index.ts at 2710505, L85-103). #94 made the create-listing route
 * the only sender, so the shared matcher must apply the same price rule.
 */

/** Verbatim predicate from the old CF (2710505 functions/src/index.ts:85-103), used as an oracle. */
function oldCloudFunctionMatches(
  search: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  const title = String(data.title || "").toLowerCase();
  const category = String(data.category || "").toLowerCase();
  const price = Number(data.price) || 0;
  const query = String(search.query || "").toLowerCase();
  const searchCategory = String(search.category || "").toLowerCase();
  if (searchCategory !== "all" && searchCategory !== category && searchCategory !== "") return false;
  if (query && !title.includes(query)) return false;
  const minPrice = Number(search.minPrice) || 0;
  const maxPrice = Number(search.maxPrice) || Infinity;
  if (price > 0 && (price < minPrice || price > maxPrice)) return false;
  return true;
}

const listing = (price: unknown) => ({
  titleLower: "sony ps5 console",
  categoryLower: "gaming",
  price,
});

type Row = [name: string, search: Record<string, unknown>, price: unknown, expected: boolean];

const ROWS: Row[] = [
  // min only
  ["min only: above", { minPrice: 100 }, "150", true],
  ["min only: below", { minPrice: 100 }, "99", false],
  ["min only: equal (inclusive)", { minPrice: 100 }, "100", true],
  // max only
  ["max only: below", { maxPrice: 500 }, "450", true],
  ["max only: above", { maxPrice: 500 }, "501", false],
  ["max only: equal (inclusive)", { maxPrice: 500 }, "500", true],
  // both
  ["both: inside", { minPrice: 100, maxPrice: 500 }, "300", true],
  ["both: below", { minPrice: 100, maxPrice: 500 }, "50", false],
  ["both: above", { minPrice: 100, maxPrice: 500 }, "900", false],
  ["both: lower boundary", { minPrice: 100, maxPrice: 500 }, "100", true],
  ["both: upper boundary", { minPrice: 100, maxPrice: 500 }, "500", true],
  ["both: fractional just above max", { minPrice: 100, maxPrice: 500 }, "500.01", false],
  ["both: inverted bounds match nothing priced", { minPrice: 500, maxPrice: 100 }, "300", false],
  // numeric strings on the saved search
  ["string bounds: inside", { minPrice: "100", maxPrice: "500" }, "300", true],
  ["string bounds: above", { minPrice: "100", maxPrice: "500" }, "600", false],
  ["string bounds with spaces", { minPrice: " 100 ", maxPrice: " 500 " }, "50", false],
  ["numeric listing price", { maxPrice: 500 }, 600, false],
  // missing / null / empty / NaN / zero bounds = no bound
  ["no bounds", {}, "999999", true],
  ["null bounds", { minPrice: null, maxPrice: null }, "999999", true],
  ["undefined bounds", { minPrice: undefined, maxPrice: undefined }, "1", true],
  ["empty-string bounds", { minPrice: "", maxPrice: "" }, "999999", true],
  ["NaN bounds", { minPrice: "abc", maxPrice: "1,000" }, "999999", true],
  ["max of 0 is NO upper bound (old CF quirk)", { maxPrice: 0 }, "999999", true],
  ["max '0' is NO upper bound (old CF quirk)", { maxPrice: "0" }, "999999", true],
  // listing price missing / zero / non-numeric => never excluded by price
  ["listing price missing", { minPrice: 100, maxPrice: 500 }, undefined, true],
  ["listing price null", { minPrice: 100, maxPrice: 500 }, null, true],
  ["listing price '0' (free)", { minPrice: 100 }, "0", true],
  ["listing price non-numeric", { minPrice: 100, maxPrice: 500 }, "POA", true],
  ["listing price negative", { minPrice: 100 }, "-5", true],
];

describe("savedSearchMatchesListing price bounds (same semantics as the old CF)", () => {
  it.each(ROWS)("%s", (_name, search, price, expected) => {
    expect(savedSearchMatchesListing({ query: "ps5", category: "Gaming", ...search }, listing(price))).toBe(
      expected
    );
  });

  it.each(ROWS)("matches the old Cloud Function predicate exactly: %s", (_name, search, price) => {
    const s = { query: "ps5", category: "Gaming", ...search };
    expect(savedSearchMatchesListing(s, listing(price))).toBe(
      oldCloudFunctionMatches(s, { title: "Sony PS5 console", category: "Gaming", price })
    );
  });
});

describe("no regression for query/category matching", () => {
  const inRange = { minPrice: 100, maxPrice: 500 };
  it.each([
    ["query match, category All", { query: "PS5", category: "All" }, true],
    ["query miss", { query: "xbox", category: "All" }, false],
    ["category match (case-insensitive)", { query: "", category: "GAMING" }, true],
    ["category miss", { query: "ps5", category: "Cars" }, false],
    ["missing query and category", {}, true],
  ] as Array<[string, Record<string, unknown>, boolean]>)("%s", (_n, search, expected) => {
    expect(savedSearchMatchesListing({ ...search, ...inRange }, listing("300"))).toBe(expected);
    expect(savedSearchMatchesListing(search, listing(undefined))).toBe(expected);
  });

  it("price never rescues a query/category miss", () => {
    expect(savedSearchMatchesListing({ query: "xbox", ...inRange }, listing("300"))).toBe(false);
    expect(savedSearchMatchesListing({ category: "Cars", ...inRange }, listing("300"))).toBe(false);
  });
});

describe("create-listing route passes the listing price to the shared matcher", () => {
  it("route calls savedSearchMatchesListing with the stored listing price; cap and limit unchanged", () => {
    const route = fs.readFileSync(
      path.join(__dirname, "..", "app/api/create-listing/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/savedSearchMatchesListing\(s,\s*\{[^}]*price:\s*opts\.listingWithId\.price/);
    expect(route).toContain("const SAVED_SEARCH_NOTIFY_CAP = 50;");
    expect(route).toMatch(/collection\("savedSearches"\)\.limit\(500\)/);
    expect(route).toMatch(/after\(\(\) =>\s*runCreateListingSideEffects\(/);
  });
});
