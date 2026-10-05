import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library).
 *
 * Every Firestore read the listing detail page makes must be legal for the viewer
 * who runs it under firestore.rules. A denied read logs
 * "FirebaseError: Missing or insufficient permissions" in the console (guest and
 * signed-in non-owner alike). Rules are NOT changed here: the client gates the read.
 */
const root = process.cwd();
const page = readFileSync(path.join(root, "app/post/listing/[id]/page.tsx"), "utf8");
const rules = readFileSync(path.join(root, "firestore.rules"), "utf8");

function ruleBlock(collection: string): string {
  const start = rules.indexOf(`match /${collection}/{`);
  expect(start, `rules block for ${collection}`).toBeGreaterThan(-1);
  const rest = rules.slice(start + 1);
  const next = rest.search(/\n\s*match \//);
  return rules.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("listing detail Firestore reads vs firestore.rules", () => {
  it("only reads collections that are public, or reads them in an owner/self-gated way", () => {
    const names = new Set(
      [...page.matchAll(/collection\(\s*db\s*,\s*"([A-Za-z]+)"/g)].map((m) => m[1])
    );
    // Public-readable (guest OK): listings, reviews, listingQuestions.
    for (const c of ["listings", "reviews", "listingQuestions"]) {
      expect(names.has(c)).toBe(true);
      expect(ruleBlock(c)).toMatch(/allow read:\s*if true;/);
    }
    // Participant-only: purchases (buyerEmail/sellerEmail == token email).
    expect(ruleBlock("purchases")).toMatch(
      /allow read: if request\.auth != null\s*&&\s*\(resource\.data\.buyerEmail == request\.auth\.token\.email\s*\|\|\s*resource\.data\.sellerEmail == request\.auth\.token\.email\)/
    );
    // Nothing else (reports, profiles, conversations, offers...) is queried from this page.
    expect([...names].sort()).toEqual(["listingQuestions", "listings", "purchases", "reviews"]);
  });

  it("does not query purchases by sellerEmail unless the viewer is that seller", () => {
    const salesQuery = page.indexOf('where("sellerEmail", "==", sellerEmailForSales), where("status", "in", ["delivered", "completed"])');
    expect(salesQuery).toBeGreaterThan(-1);
    const effectStart = page.lastIndexOf("useEffect(() => {", salesQuery);
    const guard = page.slice(effectStart, salesQuery);
    expect(guard).toMatch(/!viewerEmailForSales \|\| viewerEmailForSales !== sellerEmailForSales\) return;/);
    // the old unconditional query on listing.sellerEmail (any viewer) is gone
    expect(page).not.toMatch(/where\("sellerEmail", "==", listing\.sellerEmail\), where\("status", "in"/);
  });

  it("the public reviews read is not bundled with the owner-only purchases read", () => {
    expect(page).not.toMatch(/Promise\.all\(\[\s*getDocs\(query\(collection\(db, "reviews"\)/);
    expect(page).toMatch(/collection\(db, "reviews"\), where\("sellerEmail", "==", listing\.sellerEmail\)/);
  });

  it("buyer / seller order reads stay gated on a signed-in user email", () => {
    expect(page).toMatch(/if \(!user\?\.email \|\| !listingId\) return;[\s\S]{0,200}where\("buyerEmail", "==", user\.email\)/);
    expect(page).toMatch(/isListingOwner\(listing, user\)\) \{[\s\S]{0,200}where\("sellerEmail", "==", user\.email\)/);
  });

  it("per-user watchlist read is only issued with a uid (users/{uid}/** is owner-only)", () => {
    expect(ruleBlock("users")).toMatch(/request\.auth\.uid == userId/);
    expect(page).toMatch(/if \(!uid\) \{\s*setSavedToWatchlist\(false\);\s*return;\s*\}/);
  });

  it("rules for purchases / reports are unchanged (this fix must not loosen them)", () => {
    expect(ruleBlock("purchases")).toContain("allow create: if false;");
    expect(ruleBlock("reports")).toContain("allow create: if false;");
    expect(ruleBlock("reports")).not.toMatch(/allow read:\s*if true/);
  });
});
