import { describe, expect, it } from "vitest";
import { isKycObjectPath, parseKycStoragePath } from "./kyc-storage.server";

describe("KYC storage path parsing", () => {
  it("accepts owner-scoped object paths", () => {
    expect(isKycObjectPath("kyc/uid-1/123_photo.jpg")).toBe(true);
    expect(parseKycStoragePath("kyc/uid-1/123_photo.jpg")).toBe("kyc/uid-1/123_photo.jpg");
  });

  it("extracts the path from a legacy public download URL and ignores the token", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.firebasestorage.app/o/kyc%2Fuid-1%2Fphoto.jpg?alt=media&token=not-a-real-token";
    expect(parseKycStoragePath(url)).toBe("kyc/uid-1/photo.jpg");
  });

  it("refuses to parse non-KYC storage locations", () => {
    expect(isKycObjectPath("listings/uid-1/photo.jpg")).toBe(false);
    expect(
      parseKycStoragePath(
        "https://firebasestorage.googleapis.com/v0/b/bucket/o/listings%2Fuid-1%2Fphoto.jpg?alt=media&token=abc"
      )
    ).toBeNull();
    expect(parseKycStoragePath("https://evil.example/kyc/uid-1/photo.jpg")).toBeNull();
  });
});
