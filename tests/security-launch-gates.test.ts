import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { pickPublicProfileFields } from "../app/lib/public-profile-fields";
import { serializeProfileForClient, stripPublicListingFields } from "../app/lib/firestore-serialize";
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

describe("Public listing serialization strips sellerEmail", () => {
  it("removes sellerEmail and other PII from a public listing payload", () => {
    const result = stripPublicListingFields({
      id: "listing-1",
      title: "2015 Mazda Axela",
      price: "11500",
      sellerEmail: "seller@example.test",
      buyerEmail: "buyer@example.test",
      email: "seller@example.test",
      stripeAccountId: "acct_123",
      sellerId: "uid-abc",
      sellerUsername: "mazda-seller",
    });

    expect(result.title).toBe("2015 Mazda Axela");
    expect(result.sellerId).toBe("uid-abc");
    expect(result.sellerUsername).toBe("mazda-seller");
    expect(result.sellerEmail).toBeUndefined();
    expect(result.buyerEmail).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.stripeAccountId).toBeUndefined();
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

describe("Leftover API authz launch gates", () => {
  it("does not resolve public-profile emails without auth", () => {
    const file = readFileSync(path.join(process.cwd(), "app/api/public-profiles/route.ts"), "utf8");
    expect(file).toContain("selectPublicProfileLookups");
    expect(file).toContain("verifyIdToken");
  });

  it("does not trust client uid on phone availability", () => {
    const file = readFileSync(
      path.join(process.cwd(), "app/api/check-phone-availability/route.ts"),
      "utf8"
    );
    expect(file).toContain("resolvePhoneAvailabilityExcludeUid");
    expect(file).not.toMatch(/let uid = typeof bodyUid === "string"/);
  });

  it("disables /api/seed in production unless ALLOW_ADMIN_SEED is set", () => {
    const file = readFileSync(path.join(process.cwd(), "app/api/seed/route.ts"), "utf8");
    expect(file).toContain("ALLOW_ADMIN_SEED");
    expect(file).toContain("Seed is disabled in production.");
  });
});

describe("Security headers launch gate", () => {
  it("sets CSP frame-ancestors, object-src, base-uri, HSTS, and COOP", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("frame-ancestors 'self'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("base-uri 'self'");
    expect(config).toContain("Strict-Transport-Security");
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("Cross-Origin-Opener-Policy");
    expect(config).toContain("X-Permitted-Cross-Domain-Policies");
  });
});
