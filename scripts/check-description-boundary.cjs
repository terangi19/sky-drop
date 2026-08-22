/**
 * CI drift check — parallel description writers bypassing public boundary.
 * Usage: node scripts/check-description-boundary.cjs
 */
const fs = require("fs");
const path = require("path");

const APP_LIB = path.join(__dirname, "..", "app", "lib");

const ALLOWED_BUILD_FROM_FACTS = new Set([
  "awhina-listing-composer.ts",
  "awhina-listing-description.ts",
  "awhina-product-ux.ts",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__snapshots__") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  const violations = [];
  for (const file of walk(APP_LIB)) {
    const base = path.basename(file);
    const src = fs.readFileSync(file, "utf8");
    if (src.includes("buildListingDescriptionFromFacts") && !ALLOWED_BUILD_FROM_FACTS.has(base)) {
      violations.push(`${base}: calls buildListingDescriptionFromFacts outside allowed modules`);
    }
    if (base === "awhina-vision-compound.ts" && /listingFill\.description\s*=\s*composed/.test(src)) {
      violations.push(`${base}: assigns raw vision composed description`);
    }
  }

  const composer = fs.readFileSync(path.join(APP_LIB, "awhina-listing-composer.ts"), "utf8");
  if (!/export function enforcePublicListingDescription/.test(composer)) {
    violations.push("awhina-listing-composer.ts: missing enforcePublicListingDescription export");
  }

  if (violations.length) {
    console.error("FAIL: Description boundary drift:\n");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log("OK: Description public-copy boundary intact.");
}

main();
