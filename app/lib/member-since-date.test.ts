import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFirestoreDate } from "./date-format";

const page = readFileSync(join(__dirname, "../post/listing/[id]/page.tsx"), "utf8");
const JUNE_2024 = Date.UTC(2024, 5, 15) / 1000;

describe("listing seller 'Member since' dates", () => {
  it("parses every shape /api/public-profile or Firestore can return", () => {
    const shapes: unknown[] = [
      { _seconds: JUNE_2024, _nanoseconds: 0 }, // Admin SDK JSON (what the API actually returns)
      { seconds: JUNE_2024, nanoseconds: 0 }, // client Timestamp JSON
      { toDate: () => new Date(JUNE_2024 * 1000) }, // client Timestamp
      new Date(JUNE_2024 * 1000).toISOString(),
      JUNE_2024 * 1000,
    ];
    for (const v of shapes) expect(parseFirestoreDate(v)?.getUTCFullYear()).toBe(2024);
    expect(parseFirestoreDate({})).toBeNull();
    expect(parseFirestoreDate("not a date")).toBeNull();
  });

  it("'Member since' line uses parseFirestoreDate, not a seconds-only check", () => {
    const i = page.indexOf("Member since");
    expect(i).toBeGreaterThan(-1);
    const block = page.slice(i - 200, i + 200);
    expect(block).toContain("parseFirestoreDate(sellerProfile?.createdAt)");
    expect(block).not.toMatch(/"seconds" in sellerProfile\.createdAt/);
  });

  it("no memberSince/createdAt read is seconds-only or toDate-only", () => {
    expect(page).not.toMatch(/\(sellerProfile\.(memberSince|createdAt) as any\)\.seconds/);
    expect(page).not.toMatch(/sellerProfile\.memberSince\??\.toDate\s*\?/);
  });

  it("isNewSeller does not treat an unparseable date as 'today'", () => {
    const i = page.indexOf("const isNewSeller");
    const block = page.slice(i, i + 400);
    expect(block).toContain("parseFirestoreDate(sellerProfile.memberSince)");
    expect(block).not.toContain(": new Date()");
  });
});
