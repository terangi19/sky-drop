import { describe, expect, it } from "vitest";
import { pickPublicProfileFields } from "../app/lib/public-profile-fields";
import { serializeProfileForClient } from "../app/lib/firestore-serialize";
import { parseKycStoragePath } from "../app/lib/kyc-storage.server";

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

describe("Owner profile serialization strips KYC and bank secrets", () => {
  it("removes identity-document URLs and bank fields from the client payload", () => {
    const result = serializeProfileForClient({
      username: "user-a",
      email: "owner@example.test",
      phone: "+6412345678",
      idImageUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/kyc%2Fuid%2Fid.jpg?token=secret",
      selfieImageUrl: "https://example.test/selfie",
      storagePath: "kyc/uid/id.jpg",
      bankAccountNumber: "12-3456-7890123-00",
      bankAccountName: "Owner",
      kycStatus: "pending",
    });

    expect(result.username).toBe("user-a");
    expect(result.email).toBe("owner@example.test");
    expect(result.kycStatus).toBe("pending");
    expect(result.idImageUrl).toBeUndefined();
    expect(result.selfieImageUrl).toBeUndefined();
    expect(result.storagePath).toBeUndefined();
    expect(result.bankAccountNumber).toBeUndefined();
    expect(result.bankAccountName).toBeUndefined();
  });
});

describe("KYC object-path allowlist", () => {
  it("never treats a listing image URL as a KYC object", () => {
    expect(
      parseKycStoragePath(
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/listings%2Fuid%2Fphoto.jpg?alt=media&token=abc"
      )
    ).toBeNull();
  });
});
