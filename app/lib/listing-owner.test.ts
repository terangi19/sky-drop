import { describe, expect, it } from "vitest";
import { getListingOwnerId } from "./listing-owner";

describe("getListingOwnerId", () => {
  it("supports multiple listings sharing one seller id", () => {
    const listings = [
      { sellerId: "seller-a", title: "One" },
      { userId: "seller-a", title: "Two" },
      { ownerId: "seller-b", title: "Three" },
    ];
    const unique = [...new Set(listings.map((l) => getListingOwnerId(l)))];
    expect(unique).toEqual(["seller-a", "seller-b"]);
  });
});
