import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getSellerDisplayName,
  resolveSellerCardDisplayName,
  resolveSellerCardProfileSlug,
  sellerMessagesUrl,
  sellerProfileDisplayName,
  sellerProfileSlug,
} from "./public-display";
import { getListingOwnerId } from "./listing-owner";
import {
  clearSellerProfileBatchCache,
  fetchSellerProfilesByListing,
  invalidateSellerProfileBatchCache,
  sellerLabelFromPublicProfile,
  SELLER_PROFILE_BATCH_CACHE_TTL_MS,
} from "./fetch-seller-profiles";

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

  it("seller profile heading prefers username over displayName", () => {
    expect(
      sellerProfileDisplayName({
        username: "sky50",
        displayName: "Terangi",
      })
    ).toBe("sky50");
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
  it("username=sky50, displayName=Terangi → sky50", () => {
    expect(
      getSellerDisplayName({
        displayName: "Terangi",
        username: "sky50",
        sellerName: "legacy",
      })
    ).toBe("sky50");
  });

  it("username missing, displayName=Terangi → Terangi", () => {
    expect(
      getSellerDisplayName({
        displayName: "Terangi",
        sellerName: "legacy",
      })
    ).toBe("Terangi");
  });

  it("both missing → Seller", () => {
    expect(getSellerDisplayName({})).toBe("Seller");
  });

  it("legacy sellerUsername when username and displayName missing", () => {
    expect(
      getSellerDisplayName({
        sellerUsername: "TerangiOld",
        sellerName: "NameLegacy",
      })
    ).toBe("TerangiOld");
  });

  it("keeps long alphanumeric usernames (not Firebase UIDs)", () => {
    expect(getSellerDisplayName({ username: "philbrewerton868" })).toBe(
      "philbrewerton868"
    );
    expect(getSellerDisplayName({ username: "e2esellermsjiq5sv" })).toBe(
      "e2esellermsjiq5sv"
    );
    expect(getSellerDisplayName({ username: "terangi34" })).toBe("terangi34");
  });

  it("never email — email-like fields fall through to Seller", () => {
    expect(
      getSellerDisplayName({
        displayName: "user@example.com",
        username: "uid-abcdefghijklmnop",
        sellerName: "leak@example.com",
      })
    ).toBe("Seller");
    expect(
      getSellerDisplayName({
        username: "IeS22bePWOQ5a5oTP1w7HlO5qNq2",
      })
    ).toBe("Seller");
  });

  it("accepts legacy sellerName when safe", () => {
    expect(getSellerDisplayName({ sellerName: "KiwiTrader" })).toBe("KiwiTrader");
  });
});

describe("sellerLabelFromPublicProfile", () => {
  it("username beats displayName", () => {
    expect(
      sellerLabelFromPublicProfile({
        uid: "u1",
        username: "sky50",
        displayName: "Terangi",
      })
    ).toBe("sky50");
  });

  it("displayName when username missing", () => {
    expect(
      sellerLabelFromPublicProfile({
        uid: "u1",
        displayName: "Terangi",
      })
    ).toBe("Terangi");
  });

  it("empty when both missing", () => {
    expect(sellerLabelFromPublicProfile({ uid: "u1" }, "")).toBe("");
    expect(sellerLabelFromPublicProfile({ uid: "u1" })).toBe("");
    expect(sellerLabelFromPublicProfile({ uid: "u1" }, "Seller")).toBe("Seller");
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

  it("shows live long username when listing has no sellerUsername", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerId: "uid-abc", sellerEmail: "a@b.com" },
        { "uid-abc": "philbrewerton868" }
      )
    ).toBe("philbrewerton868");
  });

  it("old listing sellerUsername=TerangiOld, current profile username=sky50 → sky50", () => {
    expect(
      resolveSellerCardDisplayName(
        {
          sellerId: "uid-abc",
          sellerUsername: "TerangiOld",
          displayName: "Terangi",
        },
        { "uid-abc": "sky50" },
        "Seller",
        { "uid-abc": "Terangi" }
      )
    ).toBe("sky50");
  });

  it("prefers live username over live displayName", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerId: "uid-abc", sellerEmail: "test@example.com" },
        { "uid-abc": "sky50" },
        "Seller",
        { "uid-abc": "Terangi" }
      )
    ).toBe("sky50");
  });

  it("live displayName when live username missing", () => {
    expect(
      resolveSellerCardDisplayName(
        { sellerId: "uid-abc" },
        {},
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

  it("listing username beats listing displayName", () => {
    expect(
      resolveSellerCardDisplayName(
        {
          username: "sky50",
          displayName: "Terangi",
          sellerUsername: "TerangiOld",
        },
        {}
      )
    ).toBe("sky50");
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

describe("seller profile batch cache", () => {
  beforeEach(() => {
    clearSellerProfileBatchCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || "{}")) as {
          uids?: string[];
        };
        const uid = body.uids?.[0] || "uid-1";
        return {
          ok: true,
          json: async () => ({
            profiles: {
              [uid]: {
                uid,
                username: "sky50",
                displayName: "Terangi",
              },
            },
            emailToUid: {},
          }),
        };
      })
    );
  });

  afterEach(() => {
    clearSellerProfileBatchCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reuses cache within TTL then refetches after expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));

    const first = await fetchSellerProfilesByListing([{ sellerId: "uid-1" }]);
    expect(first.get("uid-1")?.username).toBe("sky50");
    expect(fetch).toHaveBeenCalledTimes(1);

    await fetchSellerProfilesByListing([{ sellerId: "uid-1" }]);
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(
      new Date(Date.now() + SELLER_PROFILE_BATCH_CACHE_TTL_MS + 1)
    );
    await fetchSellerProfilesByListing([{ sellerId: "uid-1" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("invalidateSellerProfileBatchCache forces refetch", async () => {
    await fetchSellerProfilesByListing([{ sellerId: "uid-1" }]);
    expect(fetch).toHaveBeenCalledTimes(1);

    invalidateSellerProfileBatchCache("uid-1");
    await fetchSellerProfilesByListing([{ sellerId: "uid-1" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
