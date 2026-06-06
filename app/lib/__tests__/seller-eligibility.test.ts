import { describe, it, expect } from "vitest";
import {
  profilePhoneNumber,
  profilePhoneMarkedVerified,
  profileHasVerifiedPhone,
  getListingBlockReason,
  canCreateListing,
} from "../seller-eligibility";

describe("profilePhoneNumber", () => {
  it("returns empty string for null/undefined profile", () => {
    expect(profilePhoneNumber(null)).toBe("");
    expect(profilePhoneNumber(undefined)).toBe("");
  });

  it("returns phone field", () => {
    expect(profilePhoneNumber({ phone: "021-123-4567" })).toBe("021-123-4567");
  });

  it("falls back to phoneNumber field", () => {
    expect(profilePhoneNumber({ phoneNumber: "021-999-0000" })).toBe("021-999-0000");
  });

  it("trims whitespace", () => {
    expect(profilePhoneNumber({ phone: "  021-123  " })).toBe("021-123");
  });
});

describe("profilePhoneMarkedVerified", () => {
  it("returns false for null/undefined", () => {
    expect(profilePhoneMarkedVerified(null)).toBe(false);
    expect(profilePhoneMarkedVerified(undefined)).toBe(false);
  });

  it("returns true when phoneVerified is true", () => {
    expect(profilePhoneMarkedVerified({ phoneVerified: true })).toBe(true);
  });

  it("returns true when verified is true", () => {
    expect(profilePhoneMarkedVerified({ verified: true })).toBe(true);
  });

  it("returns false when neither flag is set", () => {
    expect(profilePhoneMarkedVerified({ phone: "021-123" })).toBe(false);
  });
});

describe("profileHasVerifiedPhone", () => {
  it("returns true when auth phone is provided", () => {
    expect(profileHasVerifiedPhone(null, "+6421123456")).toBe(true);
  });

  it("returns false for null profile without auth phone", () => {
    expect(profileHasVerifiedPhone(null)).toBe(false);
  });

  it("returns true for verified profile phone", () => {
    expect(
      profileHasVerifiedPhone({ phone: "021-123", phoneVerified: true })
    ).toBe(true);
  });

  it("returns false for unverified profile phone", () => {
    expect(
      profileHasVerifiedPhone({ phone: "021-123", phoneVerified: false })
    ).toBe(false);
  });

  it("returns false when profile has no phone", () => {
    expect(profileHasVerifiedPhone({ phoneVerified: true })).toBe(false);
  });
});

describe("getListingBlockReason", () => {
  const validOpts = {
    authEmailVerified: true,
    phone: "021-123",
    phoneVerified: true,
    profileExists: true,
  };

  it("returns null when all checks pass", () => {
    expect(getListingBlockReason(validOpts)).toBeNull();
  });

  it("blocks restricted accounts", () => {
    expect(getListingBlockReason({ ...validOpts, restricted: true })).toContain("restricted");
  });

  it("blocks when profile does not exist", () => {
    expect(getListingBlockReason({ ...validOpts, profileExists: false })).toContain("profile");
  });

  it("blocks when email not verified", () => {
    expect(
      getListingBlockReason({ ...validOpts, authEmailVerified: false })
    ).toContain("email");
  });

  it("allows listing with auth phone even without profile phone", () => {
    expect(
      getListingBlockReason({
        authEmailVerified: true,
        authPhoneNumber: "+6421123",
        profileExists: true,
      })
    ).toBeNull();
  });

  it("blocks when no phone verified", () => {
    expect(
      getListingBlockReason({
        authEmailVerified: true,
        profileExists: true,
      })
    ).toContain("phone");
  });
});

describe("canCreateListing", () => {
  it("returns true when getListingBlockReason returns null", () => {
    expect(
      canCreateListing({
        authEmailVerified: true,
        phone: "021-123",
        phoneVerified: true,
        profileExists: true,
      })
    ).toBe(true);
  });

  it("returns false when blocked", () => {
    expect(canCreateListing({ authEmailVerified: false })).toBe(false);
  });
});
