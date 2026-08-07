import { describe, expect, it } from "vitest";
import {
  sellerMessagesUrl,
  sellerProfileDisplayName,
  sellerProfileSlug,
} from "./public-display";

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
