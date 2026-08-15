import { describe, expect, it } from "vitest";
import { pickPublicProfileFields } from "../app/lib/public-profile-fields";

describe("Public profile allowlist launch gate", () => {
  it("returns intended public fields and strips private account data", () => {
    const result = pickPublicProfileFields("profile-user-a", {
      username: "user-a",
      displayName: "User A",
      bio: "Public bio",
      trustedSeller: true,
      email: "private@example.test",
      phone: "+6412345678",
      address: "Private address",
      bankAccount: "00-0000-0000000-00",
      riskFlag: true,
      kycDocumentUrl: "https://private.example.test/id",
    });

    expect(result).toEqual({
      uid: "profile-user-a",
      username: "user-a",
      displayName: "User A",
      bio: "Public bio",
      trustedSeller: true,
    });
  });
});
