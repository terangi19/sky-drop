import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./fetch-public-profile-client", () => ({ fetchPublicProfileBySlug: h.fetch }));

import {
  NO_SELLER_TRUST,
  checkoutSellerTrustFromProfile,
  loadCheckoutSellerTrust,
} from "./checkout-seller-trust";
import { PUBLIC_PROFILE_FIELDS } from "./public-profile-fields";

beforeEach(() => h.fetch.mockReset());

describe("checkout seller trust comes from real public profile fields", () => {
  it("rating = averageRating only when the seller has reviews", () => {
    expect(checkoutSellerTrustFromProfile({ averageRating: 4.6, reviewCount: 3 }).rating).toBe(4.6);
    expect(checkoutSellerTrustFromProfile({ averageRating: 4.6, reviewCount: 0 }).rating).toBeNull();
    expect(checkoutSellerTrustFromProfile({ averageRating: 0, reviewCount: 0 }).rating).toBeNull();
    expect(checkoutSellerTrustFromProfile({ reviewCount: 2 }).rating).toBeNull();
  });

  it("ignores the old non-existent field names (sellerRating / averageResponseTime)", () => {
    expect(
      checkoutSellerTrustFromProfile({ sellerRating: 4.8, averageResponseTime: "2 hours" } as never)
    ).toEqual(NO_SELLER_TRUST);
  });

  it("responseTime: a ready label is shown, a bare number (unknown unit) is not", () => {
    expect(checkoutSellerTrustFromProfile({ responseTime: "2 hours" }).responseTime).toBe("2 hours");
    expect(checkoutSellerTrustFromProfile({ responseTime: 120 }).responseTime).toBeNull();
    expect(checkoutSellerTrustFromProfile({ responseTime: "  " }).responseTime).toBeNull();
  });

  it("the fields it reads are the ones the public profile API exposes", () => {
    for (const f of ["averageRating", "reviewCount", "responseTime"]) {
      expect(PUBLIC_PROFILE_FIELDS as readonly string[]).toContain(f);
    }
  });

  it("loads through the public profile lookup (uid slug) and never throws", async () => {
    h.fetch.mockResolvedValueOnce({ uid: "S1", averageRating: 4.2, reviewCount: 5 });
    expect(await loadCheckoutSellerTrust("S1")).toEqual({ rating: 4.2, responseTime: null });
    expect(h.fetch).toHaveBeenCalledWith("S1");
    h.fetch.mockRejectedValueOnce(new Error("500"));
    expect(await loadCheckoutSellerTrust("S1")).toEqual(NO_SELLER_TRUST);
    h.fetch.mockResolvedValueOnce(null);
    expect(await loadCheckoutSellerTrust("S1")).toEqual(NO_SELLER_TRUST);
    expect(await loadCheckoutSellerTrust("")).toEqual(NO_SELLER_TRUST);
  });
});

describe("CheckoutModal source guard", () => {
  const src = readFileSync(join(process.cwd(), "app/components/CheckoutModal.tsx"), "utf8");
  it("no client getDoc of the seller's owner-only profile and no phantom field names", () => {
    expect(src).not.toMatch(/doc\(db, "profiles", listing\.sellerId\)/);
    expect(src).not.toContain("sellerData.sellerRating");
    expect(src).not.toContain("averageResponseTime");
    expect(src).toContain("loadCheckoutSellerTrust(");
  });
  it("the seller lookup is its own effect, not behind the buyer-profile early return", () => {
    const sellerAt = src.indexOf("loadCheckoutSellerTrust(sellerKey)");
    const buyerAt = src.indexOf('getDoc(doc(db, "profiles", user.uid))');
    expect(sellerAt).toBeGreaterThan(0);
    expect(buyerAt).toBeGreaterThan(sellerAt);
  });
});
