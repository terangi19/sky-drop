import { describe, expect, it } from "vitest";
import {
  hasHighestBidder,
  isOwnListing,
  isSameBidder,
  resolveSellerUid,
} from "./auction-bidder-identity";

describe("resolveSellerUid", () => {
  it("prefers sellerUid over sellerId", () => {
    expect(resolveSellerUid({ sellerUid: "uid-a", sellerId: "uid-b" })).toBe("uid-a");
  });

  it("falls back to sellerId, then empty", () => {
    expect(resolveSellerUid({ sellerId: "uid-b" })).toBe("uid-b");
    expect(resolveSellerUid({ sellerUid: "  ", sellerId: "uid-b" })).toBe("uid-b");
    expect(resolveSellerUid({})).toBe("");
  });
});

describe("isOwnListing", () => {
  it("is true on uid match even when emails differ", () => {
    expect(
      isOwnListing({
        bidderUid: "seller-1",
        bidderEmail: "new@example.test",
        sellerUid: "seller-1",
        sellerEmail: "old@example.test",
      })
    ).toBe(true);
  });

  it("is true on legacy email-only, case-insensitive", () => {
    expect(
      isOwnListing({
        bidderUid: "someone-else",
        bidderEmail: "Seller@Example.test",
        sellerUid: "",
        sellerEmail: "seller@example.test",
      })
    ).toBe(true);
  });

  it("is false when uids differ even if emails match", () => {
    expect(
      isOwnListing({
        bidderUid: "bidder-1",
        bidderEmail: "same@example.test",
        sellerUid: "seller-1",
        sellerEmail: "same@example.test",
      })
    ).toBe(false);
  });
});

describe("isSameBidder", () => {
  it("uses uid when highestBidderUid exists", () => {
    expect(
      isSameBidder({
        bidderUid: "bidder-1",
        bidderEmail: "changed@example.test",
        highestBidderUid: "bidder-1",
        highestBidderEmail: "original@example.test",
      })
    ).toBe(true);
    expect(
      isSameBidder({
        bidderUid: "bidder-2",
        bidderEmail: "original@example.test",
        highestBidderUid: "bidder-1",
        highestBidderEmail: "original@example.test",
      })
    ).toBe(false);
  });

  it("falls back to case-insensitive email when no uid is stored", () => {
    expect(
      isSameBidder({
        bidderUid: "bidder-1",
        bidderEmail: "Buyer@Example.test",
        highestBidderUid: "",
        highestBidderEmail: "buyer@example.test",
      })
    ).toBe(true);
  });

  it("is false when both uid and email are empty", () => {
    expect(
      isSameBidder({
        bidderUid: "bidder-1",
        bidderEmail: "buyer@example.test",
        highestBidderUid: "",
        highestBidderEmail: "",
      })
    ).toBe(false);
    expect(
      isSameBidder({
        bidderUid: "",
        bidderEmail: "",
        highestBidderUid: "",
        highestBidderEmail: "  ",
      })
    ).toBe(false);
  });
});

describe("hasHighestBidder", () => {
  it("is true when uid or email is present", () => {
    expect(hasHighestBidder("bidder-1", "")).toBe(true);
    expect(hasHighestBidder("", "buyer@example.test")).toBe(true);
  });

  it("is false when both are empty", () => {
    expect(hasHighestBidder("", "")).toBe(false);
    expect(hasHighestBidder("  ", "  ")).toBe(false);
  });
});
