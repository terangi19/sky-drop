import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicSalesCount } from "./public-sales-count";
import { PUBLIC_PROFILE_FIELDS, pickPublicProfileFields } from "./public-profile-fields";

describe("publicSalesCount", () => {
  it("uses the public salesCount, 0 when missing or junk", () => {
    expect(publicSalesCount({ salesCount: 7 })).toBe(7);
    expect(publicSalesCount({ salesCount: 0 })).toBe(0);
    expect(publicSalesCount({})).toBe(0);
    expect(publicSalesCount(null)).toBe(0);
    expect(publicSalesCount({ salesCount: -3 })).toBe(0);
    expect(publicSalesCount({ salesCount: "12" })).toBe(0);
    expect(publicSalesCount({ salesCount: Number.NaN })).toBe(0);
  });

  it("the public profile API actually exposes salesCount", () => {
    expect(PUBLIC_PROFILE_FIELDS as readonly string[]).toContain("salesCount");
    expect(pickPublicProfileFields("u1", { salesCount: 4, email: "x@y.z" })).toEqual({ uid: "u1", salesCount: 4 });
  });
});

describe("no client purchases scan for another seller's sales", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("messages page chat header uses publicSalesCount and no purchases-by-sellerEmail fallback", () => {
    const src = read("app/messages/page.tsx");
    const start = src.indexOf("Fetch seller profile + trust score");
    const block = src.slice(start, src.indexOf("return () => { cancelled = true; };", start));
    expect(block).toContain("publicSalesCount(profile)");
    expect(block).not.toContain('collection(db, "purchases")');
  });
  it("seller page 'Completed sales' uses publicSalesCount and never queries purchases", () => {
    const src = read("app/seller/[username]/page.tsx");
    expect(src).toContain("publicSalesCount(profile)");
    expect(src).not.toContain('collection(db, "purchases")');
  });
});
