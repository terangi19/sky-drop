import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { savedSearchMatchesListing } from "../app/lib/saved-search-match";

const ROOT = path.join(__dirname, "..");

describe("saved-search notifications have ONE sender (the create-listing route)", () => {
  // functions/src is compiled to the COMMITTED functions/lib (firebase.json has no predeploy),
  // so both must be clean. Static on purpose: importing functions/src/index.ts needs
  // functions/node_modules, which root `npm ci` (CI) does not install.
  it("neither the Cloud Function source nor its compiled output scans savedSearches or notifies", () => {
    for (const rel of ["functions/src/index.ts", "functions/lib/index.js"]) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const start = src.search(/(?:export const |exports\.)onListingCreated\s*=\s*(?:\(0,|onDocumentCreated)/);
      const end = src.search(/(?:export const |exports\.)onMessageCreated\s*=\s*(?:\(0,|onDocumentCreated)/);
      expect(start, `${rel}: onListingCreated export`).toBeGreaterThanOrEqual(0);
      expect(end, `${rel}: onMessageCreated export`).toBeGreaterThan(start);
      const body = src.slice(start, end);
      expect(body, rel).not.toMatch(/createNotification|\.add\(|\.get\(\)/);
      expect(body, rel).not.toMatch(/savedSearches/);
      expect(src, rel).not.toMatch(/collection\(\s*["']savedSearches["']\s*\)/);
      expect(src, rel).not.toMatch(/saved_search_match/);
    }
  });

  it("the create-listing route is the one sender, bounded, using the shared matcher", () => {
    const route = fs.readFileSync(path.join(ROOT, "app/api/create-listing/route.ts"), "utf8");
    expect(route).toContain('type: "saved_search_match"');
    expect(route).toMatch(/collection\("savedSearches"\)\.limit\(\d+\)/);
    expect(route).toContain("savedSearchMatchesListing(");
  });
});

describe("savedSearchMatchesListing", () => {
  const listing = { titleLower: "apple iphone 15 pro", categoryLower: "phones" };

  it("matches query as a case-insensitive title substring", () => {
    expect(savedSearchMatchesListing({ query: "IPHONE", category: "All" }, listing)).toBe(true);
    expect(savedSearchMatchesListing({ query: "samsung", category: "All" }, listing)).toBe(false);
  });

  it("treats empty query as match-all and missing/All category as any category", () => {
    expect(savedSearchMatchesListing({ query: "", category: "All" }, listing)).toBe(true);
    expect(savedSearchMatchesListing({}, listing)).toBe(true);
    expect(savedSearchMatchesListing({ query: "iphone" }, listing)).toBe(true);
  });

  it("requires the category to equal the listing category (case-insensitive)", () => {
    expect(savedSearchMatchesListing({ query: "", category: "Phones" }, listing)).toBe(true);
    expect(savedSearchMatchesListing({ query: "", category: "Cars" }, listing)).toBe(false);
    expect(savedSearchMatchesListing({ query: "iphone", category: "Cars" }, listing)).toBe(false);
  });

  it("ignores non-string query/category values safely", () => {
    expect(savedSearchMatchesListing({ query: null, category: undefined }, listing)).toBe(true);
    expect(savedSearchMatchesListing({ query: 42 as unknown, category: "All" }, listing)).toBe(false);
  });
});
