/**
 * Architectural drift — description writers must not bypass the public boundary.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const APP_LIB = join(ROOT, "app", "lib");

const ALLOWED_BUILD_FROM_FACTS = new Set([
  "awhina-listing-composer.ts",
  "awhina-listing-description.ts",
  "awhina-listing-description.test.ts",
  "awhina-description-quality-suite.test.ts",
  "awhina-description-universal.test.ts",
  "awhina-description-boundary-drift.test.ts",
  "awhina-premium-pass.test.ts",
  "awhina-listing-identity.test.ts",
  "awhina-form-sync.test.ts",
  "awhina-form-ui-sync.test.ts",
  "awhina-description-diversity.test.ts",
  "awhina-seller-evidence.test.ts",
  "awhina-description-writer-async.test.ts",
  "awhina-orchestration-leak.test.ts",
  "awhina-universal-visual-identity.test.ts",
  "awhina-rich-listing-description.test.ts",
  "awhina-product-ux.ts",
]);

const FORBIDDEN_DIRECT_DESC_ASSIGN = /\.description\s*=\s*(?!""|undefined|null)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__snapshots__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("description boundary drift", () => {
  it("buildListingDescriptionFromFacts only called from allowed modules", () => {
    const violations: string[] = [];
    for (const file of walk(APP_LIB)) {
      const base = file.split(/[/\\]/).pop() || "";
      if (base.endsWith(".test.ts")) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("buildListingDescriptionFromFacts")) continue;
      if (!ALLOWED_BUILD_FROM_FACTS.has(base)) {
        violations.push(base);
      }
    }
    expect(violations, violations.join(", ")).toEqual([]);
  });

  it("enforcePublicListingDescription is exported from composer", () => {
    const src = readFileSync(join(APP_LIB, "awhina-listing-composer.ts"), "utf8");
    expect(src).toMatch(/export function enforcePublicListingDescription/);
    expect(src).toMatch(/validateDescriptionQualityContract/);
  });

  it("finishFill uses enforcePublicListingDescription", () => {
    const src = readFileSync(join(APP_LIB, "awhina-listing-fill-tools.ts"), "utf8");
    expect(src).toMatch(/enforcePublicListingDescription/);
  });

  it("vision compound does not assign raw composed description", () => {
    const src = readFileSync(join(APP_LIB, "awhina-vision-compound.ts"), "utf8");
    expect(src).not.toMatch(/listingFill\.description\s*=\s*composed/);
  });
});
