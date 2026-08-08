import { describe, expect, it } from "vitest";
import {
  getSellerDisplayName,
  resolveSellerCardDisplayName,
  resolveSellerCardProfileSlug,
  sellerMessagesUrl,
  sellerProfileDisplayName,
  sellerProfileSlug,
} from "./public-display";
import { getListingOwnerId } from "./listing-owner";

describe("public display privacy helpers", () => {
  it("prefers public usernames for seller slugs", () => {
    expect(
      sellerProfileSlug({
        sellerUsername: "@SkySeller",
        sellerEmail: "seller@example.com",
        sellerId: "uid-123",
      })
    ).toBe("SkySeller");
  });

  it("falls back to seller id instead of exposing email", () => {
    expect(
      sellerProfileSlug({
        sellerEmail: "seller@example.com",
        sellerId: "uid-123",
      })
    ).toBe("uid-123");
  });

  it("hides email-like display names", () => {
    expect(
      sellerProfileDisplayName({
        sellerEmail: "seller@example.com",
      })
    ).toBe("Seller");
  });

  it("builds message urls without email fallbacks", () => {
    expect(
      sellerMessagesUrl(
        {
          sellerEmail: "seller@example.com",
          sellerId: "uid-123",
        },
        "listing-1",
        { purchased: 1 }
      )
    ).toBe("/messages?user=uid-123&listing=listing-1&purchased=1");
  });

  it("skips email-local-part usernames so Message Seller stays deliverable", () => {
    expect(
      sellerMessagesUrl(
        {
          sellerUsername: "seller",
          sellerEmail: "seller@example.com",
          sellerId: "uid-123",
        },
        "listing-9"
      )
    ).toBe("/messages?user=uid-123&listing=listing-9");
  });
});

describe("getListingOwnerId", () => {
  it("prefers sellerId then legacy owner fields", () => {
    expect(getListingOwnerId({ sellerId: "a", userId: "b" })).toBe("a");
    expect(getListingOwnerId({ userId: "b", ownerId: "c" })).toBe("b");
    expect(getListingOwnerId({ ownerId: "c", sellerUid: "d" })).toBe("c");
    expect(getListingOwnerId({ sellerUid: "d", uid: "e" })).toBe("d");
    expect(getListingOwnerId({ uid: "e" })).toBe("e");
    expect(getListingOwnerId({})).toBe("");
  });
});

describe("getSellerDisplayName", () => {
  it("Seller A: displayName Terangi wins", () => {
    expect(
      getSellerDisplayName({
        displayName: "Terangi",
        username: "terangi34",
        sellerName: "legacy",
      })
    ).toBe("Terangi");
  });

  it("Seller B: username when no displayName", () => {
    expect(
      getSellerDisplayName({
        username: "sky123",
        sellerName: "legacy",
      })
    ).toBe("sky123");
  });

  it("Seller C: only Seller when no public identity", () => {
    expect(getSellerDisplayName({})).toBe("Seller");
    expect(
      getSellerDisplayName({
        displayName: "user@example.com",
        username: "uid-abcdefghijklmnop",
        sellerName: "leak@example.com",
      })
    ).toBe("Seller");
  });

  it("accepts legacy sellerName when safe", () => {
    expect(getSellerDisplayName({ sellerName: "KiwiTrader" })).toBe("KiwiTrader");
  });
});

describe("resolveSellerCardDisplayName", () => {
  it("uses live profile username when listing has no sellerUsername", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerEmail: "test@example.com" },
        { "test@example.com": "SkyDavis" }
      )
    ).toBe("SkyDavis");
  });

  it("resolves live identity by owner UID (canonical enrichment key)", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerId: "uid-abc", sellerEmail: "test@example.com" },
        { "uid-abc": "terangi34" },
        "Seller",
        { "uid-abc": "Terangi" }
      )
    ).toBe("Terangi");
  });

  it("prefers current profile username over stale listing username", () => {
    expect(
      resolveSellerCardDisplayName(
        {
          sellerEmail: "test@example.com",
          sellerUsername: "OldHandle",
        },
        { "test@example.com": "SkyDavis" }
      )
    ).toBe("SkyDavis");
  });

  it("falls back to Seller when no username exists anywhere", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerEmail: "test@example.com", sellerId: "uid-abcdefghijklmnop" },
        {}
      )
    ).toBe("Seller");
  });

  it("never exposes raw seller email as the card label", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerEmail: "test@example.com", sellerUsername: "test@example.com" },
        { "test@example.com": "test@example.com" }
      )
    ).toBe("Seller");
    expect(
      resolveSellerCardDisplayName({ sellerEmail: "leak@example.com" }, null)
    ).toBe("Seller");
  });

  it("uses safe listing sellerUsername when profile handles are missing", () => {
    expect(
      resolveSellerCardDisplayName(
        {
          sellerEmail: "test@example.com",
          sellerUsername: "@SkyDavis",
        },
        {}
      )
    ).toBe("SkyDavis");
  });

  it("resolves profile slug from live handle without rewriting listing docs", () => {
    expect(
      resolveSellerCardProfileSlug(
        {
          sellerEmail: "test@example.com",
          sellerUsername: "OldHandle",
          sellerId: "uid-123",
        },
        { "test@example.com": "SkyDavis" }
      )
    ).toBe("SkyDavis");
  });

  it("uses owner-UID keyed live handle for profile slug", () => {
    expect(
      resolveSellerCardProfileSlug(
        { sellerId: "uid-xyz", sellerEmail: "a@b.com" },
        { "uid-xyz": "terangi34" }
      )
    ).toBe("terangi34");
  });
});
