import { describe, expect, it } from "vitest";
import { canCreateListing, getListingBlockReason } from "./seller-eligibility";

describe("getListingBlockReason", () => {
  it("blocks unverified email so the UI cannot show ready-to-sell", () => {
    expect(
      getListingBlockReason({
        authEmailVerified: false,
        profileExists: true,
      })
    ).toMatch(/verify your email/i);
    expect(
      canCreateListing({ authEmailVerified: false, profileExists: true })
    ).toBe(false);
  });

  it("allows a verified user with a profile", () => {
    expect(
      getListingBlockReason({
        authEmailVerified: true,
        profileExists: true,
      })
    ).toBeNull();
  });

  it("blocks restricted accounts first", () => {
    expect(
      getListingBlockReason({
        authEmailVerified: true,
        profileExists: true,
        restricted: true,
      })
    ).toMatch(/restricted/i);
  });

  it("does not infer a block when email verification was not provided", () => {
    expect(getListingBlockReason({ profileExists: true })).toBeNull();
  });
});
