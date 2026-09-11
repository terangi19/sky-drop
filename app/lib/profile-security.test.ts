import { describe, expect, it } from "vitest";
import { stripClientForbiddenProfileFields } from "./profile-privileged-fields";
import { resolveProfilePhoneUpdate } from "./profile-phone-update";
import { isPublicHttpUrl } from "./http-url";

describe("Client profile privileged-field strip", () => {
  it("removes verification, KYC, stripe, and reputation keys", () => {
    const result = stripClientForbiddenProfileFields({
      username: "user-a",
      bio: "hello",
      phoneVerified: true,
      emailVerified: true,
      verified: true,
      kycApproved: true,
      kycStatus: "approved",
      stripeAccountId: "acct_123",
      followers: 99,
      email: "owner@example.test",
    });
    expect(result).toEqual({
      username: "user-a",
      bio: "hello",
      email: "owner@example.test",
    });
  });
});

describe("Profile phone update resolver", () => {
  it("keeps verification when the number is unchanged", () => {
    expect(
      resolveProfilePhoneUpdate({
        incomingPhone: "+64211234567",
        existingPhone: "+64211234567",
        existingPhoneVerified: true,
      })
    ).toEqual({
      phone: "+64211234567",
      phoneNumber: "+64211234567",
      phoneVerified: true,
      releasePrevious: false,
    });
  });

  it("drops verification when the number changes", () => {
    expect(
      resolveProfilePhoneUpdate({
        incomingPhone: "+64219876543",
        existingPhone: "+64211234567",
        existingPhoneVerified: true,
      })
    ).toEqual({
      phone: "+64219876543",
      phoneNumber: "+64219876543",
      phoneVerified: false,
      releasePrevious: true,
    });
  });

  it("clears verification on explicit remove", () => {
    expect(
      resolveProfilePhoneUpdate({
        clearPhone: true,
        existingPhone: "+64211234567",
        existingPhoneVerified: true,
      })
    ).toEqual({
      phone: "",
      phoneNumber: "",
      phoneVerified: false,
      releasePrevious: true,
    });
  });

  it("never elevates verification from an unverified existing profile", () => {
    expect(
      resolveProfilePhoneUpdate({
        incomingPhone: "+64211234567",
        existingPhone: "+64211234567",
        existingPhoneVerified: false,
      }).phoneVerified
    ).toBe(false);
  });
});

describe("Public HTTP URL allowlist", () => {
  it("accepts public http(s) URLs and rejects local or non-http schemes", () => {
    expect(isPublicHttpUrl("https://www.trademe.co.nz/a/listing")).toBe(true);
    expect(isPublicHttpUrl("http://example.test/item")).toBe(true);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isPublicHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPublicHttpUrl("http://localhost/admin")).toBe(false);
    expect(isPublicHttpUrl("not a url")).toBe(false);
  });
});
