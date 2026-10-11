import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  savedSearchMatchesListing,
  storedListingCategoryLower,
} from "../app/lib/saved-search-match";

/**
 * Category parity with the retired onListingCreated Cloud Function
 * (functions/src/index.ts at 2710505, L85-103). The CF compared saved searches
 * against the STORED listing doc (data.category). The create-listing route stores
 * vehicles as "Cars" (route.ts: `listingType === "vehicle" ? "Cars" : category || "Other"`),
 * so matching must use the stored category, not the request-body category.
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

/** The route's stored-category rule (asserted against route.ts below). */
function storedCategoryLikeRoute(listingType: string, bodyCategory: unknown): unknown {
  return listingType === "vehicle" ? "Cars" : bodyCategory || "Other";
}

/** Facts exactly as the route builds them from the stored listing doc. */
function routeFacts(doc: Record<string, unknown>) {
  return {
    titleLower: String(doc.title || "").toLowerCase(),
    categoryLower: storedListingCategoryLower(doc.category),
    price: doc.price,
  };
}

type Listing = { listingType: string; bodyCategory: unknown };

const LISTINGS: Array<[string, Listing]> = [
  ["vehicle, body category missing", { listingType: "vehicle", bodyCategory: undefined }],
  ["vehicle, body category empty", { listingType: "vehicle", bodyCategory: "" }],
  ["vehicle, body category 'Cars'", { listingType: "vehicle", bodyCategory: "Cars" }],
  ["vehicle, body category 'Vehicles'", { listingType: "vehicle", bodyCategory: "Vehicles" }],
  ["vehicle, body category 'Other'", { listingType: "vehicle", bodyCategory: "Other" }],
  ["physical Tech", { listingType: "physical", bodyCategory: "Tech" }],
  ["physical Gaming", { listingType: "physical", bodyCategory: "Gaming" }],
  ["physical, category missing -> Other", { listingType: "physical", bodyCategory: undefined }],
  ["physical, category empty -> Other", { listingType: "physical", bodyCategory: "" }],
  ["physical, lower-case 'tech'", { listingType: "physical", bodyCategory: "tech" }],
  ["physical, padded ' Tech '", { listingType: "physical", bodyCategory: " Tech " }],
  ["service Photography", { listingType: "service", bodyCategory: "Photography" }],
  ["rental Vehicles", { listingType: "rental", bodyCategory: "Vehicles" }],
  ["wanted Vehicles", { listingType: "wanted", bodyCategory: "Vehicles" }],
];

const SEARCH_CATEGORIES: unknown[] = [
  "Cars", "cars", "CARS", " Cars", "Vehicles", "Tech", "tech", "Gaming", "Other",
  "Photography", "All", "all", "", undefined, null, 0, [],
];

describe("category parity with the old Cloud Function (stored category)", () => {
  const rows: Array<[string, unknown, Listing]> = [];
  for (const [name, l] of LISTINGS) for (const c of SEARCH_CATEGORIES) rows.push([name, c, l]);

  it.each(rows)("%s vs saved category %j", (_name, searchCategory, l) => {
    const doc = {
      title: "Toyota Corolla 2015 hatch",
      category: storedCategoryLikeRoute(l.listingType, l.bodyCategory),
      price: "9500",
    };
    for (const query of ["", "corolla", "COROLLA", "civic"]) {
      const search = { query, category: searchCategory, userEmail: "a@b.c" };
      expect(savedSearchMatchesListing(search, routeFacts(doc))).toBe(oldCloudFunctionMatches(search, doc));
    }
  });

  it("'Cars' saved searches match vehicle listings whatever category the client sent", () => {
    for (const bodyCategory of [undefined, "", "Cars", "Vehicles", "Other"]) {
      const doc = { title: "Mazda 3", category: storedCategoryLikeRoute("vehicle", bodyCategory), price: "8000" };
      expect(savedSearchMatchesListing({ category: "Cars" }, routeFacts(doc))).toBe(true);
    }
  });

  it("stored category helper copies the CF: lower-case, no trim, missing -> ''", () => {
    expect(storedListingCategoryLower("Cars")).toBe("cars");
    expect(storedListingCategoryLower(" Tech ")).toBe(" tech ");
    expect(storedListingCategoryLower(undefined)).toBe("");
    expect(storedListingCategoryLower(null)).toBe("");
    expect(storedListingCategoryLower("")).toBe("");
  });

  it("missing stored category only matches All/empty/missing saved categories", () => {
    const facts = routeFacts({ title: "x", category: undefined });
    expect(savedSearchMatchesListing({ category: "All" }, facts)).toBe(true);
    expect(savedSearchMatchesListing({}, facts)).toBe(true);
    expect(savedSearchMatchesListing({ category: "Other" }, facts)).toBe(false);
  });
});

describe("create-listing route matches on the stored category", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "app/api/create-listing/route.ts"), "utf8");

  it("builds categoryLower from opts.listingWithId.category via storedListingCategoryLower", () => {
    expect(route).toMatch(
      /const categoryLower = storedListingCategoryLower\(opts\.listingWithId\.category\);/
    );
    expect(route).not.toMatch(/const categoryLower = opts\.category\.toLowerCase\(\)/);
  });

  it("listingWithId is the stored doc and still stores vehicles as 'Cars'", () => {
    expect(route).toMatch(/category:\s*listingType === "vehicle"\s*\?\s*"Cars"\s*:\s*category \|\| "Other",/);
    expect(route).toMatch(/const listingWithId = \{ \.\.\.finalData,/);
  });

  it("cap, limit(500), after() scan and price pass-through are unchanged", () => {
    expect(route).toContain("const SAVED_SEARCH_NOTIFY_CAP = 50;");
    expect(route).toMatch(/collection\("savedSearches"\)\.limit\(500\)/);
    expect(route).toMatch(/after\(\(\) =>\s*runCreateListingSideEffects\(/);
    expect(route).toMatch(/price:\s*opts\.listingWithId\.price/);
  });
});
