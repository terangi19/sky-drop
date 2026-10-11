import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { LISTING_CONDITIONS } from "./awhina-listing-condition";
import { listingMatchesConditionFilter } from "./listing-search-filters";

/**
 * Source guard (no jsdom): both /search Condition selects (desktop + mobile
 * filter sheet) offer only values listings can actually have, and every option
 * value returns at least one canonical listing through the real matcher.
 */
const src = readFileSync(path.join(process.cwd(), "app/search/page.tsx"), "utf8");

function conditionSelects(): string[][] {
  const out: string[][] = [];
  let from = 0;
  for (;;) {
    const labelAt = src.indexOf(">Condition</label>", from);
    if (labelAt < 0) break;
    const selStart = src.indexOf("<select", labelAt);
    const selEnd = src.indexOf("</select>", selStart);
    const values = [...src.slice(selStart, selEnd).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    out.push(values);
    from = selEnd;
  }
  return out;
}

describe("/search Condition options (M5 Part B)", () => {
  const selects = conditionSelects();

  it("finds both the desktop and mobile Condition selects", () => {
    expect(selects).toHaveLength(2);
  });

  it.each([0, 1])("select %i offers All, New, Used and the graded values only", (i) => {
    expect(selects[i]).toEqual(["all", "New", "Used", "Used - Like New", "Used - Good", "Used - Fair"]);
  });

  it("no dead options (Refurbished / For parts) remain in the page", () => {
    expect(src).not.toContain("Refurbished");
    expect(src).not.toContain("For parts");
  });

  it("every non-'all' option matches at least one canonical stored condition", () => {
    for (const value of selects[0].filter((v) => v !== "all")) {
      const hits = LISTING_CONDITIONS.filter((c) => listingMatchesConditionFilter({ type: "physical", condition: c }, value));
      expect(hits.length, value).toBeGreaterThan(0);
    }
  });
});
