import { describe, expect, it } from "vitest";
import {
  downloadTokenClearMetadata,
  isFirebaseDownloadUrlWithToken,
  isSensitiveObjectPath,
  objectHasDownloadToken,
  parseCliArgs,
  parseSensitiveStoragePath,
  planFirestoreScrub,
} from "../../scripts/lib/kyc-token-revoke.cjs";

const TOKEN_URL =
  "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.firebasestorage.app/o/kyc%2Fuid-1%2Fphoto.jpg?alt=media&token=not-a-real-token";

const LEGACY_TOKEN_URL =
  "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.appspot.com/o/proof_of_address%2Fuid-1%2Fproof.pdf?alt=media&token=not-a-real-token";

describe("KYC token revoke helpers", () => {
  it("defaults to dry-run unless --apply is passed", () => {
    expect(parseCliArgs([])).toEqual({ apply: false, help: false });
    expect(parseCliArgs(["--apply"])).toEqual({ apply: true, help: false });
    expect(parseCliArgs(["--help"]).help).toBe(true);
  });

  it("accepts only kyc/ and proof_of_address/ object paths", () => {
    expect(isSensitiveObjectPath("kyc/uid-1/photo.jpg")).toBe(true);
    expect(isSensitiveObjectPath("proof_of_address/uid-1/proof.pdf")).toBe(true);
    expect(isSensitiveObjectPath("listings/uid-1/photo.jpg")).toBe(false);
    expect(isSensitiveObjectPath(TOKEN_URL)).toBe(false);
  });

  it("extracts paths from current and legacy tokenized download URLs", () => {
    expect(parseSensitiveStoragePath(TOKEN_URL)).toBe("kyc/uid-1/photo.jpg");
    expect(parseSensitiveStoragePath(LEGACY_TOKEN_URL)).toBe("proof_of_address/uid-1/proof.pdf");
    expect(isFirebaseDownloadUrlWithToken(TOKEN_URL)).toBe(true);
  });

  it("refuses listing images, other hosts, and token-less non-KYC URLs", () => {
    expect(
      parseSensitiveStoragePath(
        "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.firebasestorage.app/o/listings%2Fuid%2Fphoto.jpg?alt=media&token=abc"
      )
    ).toBeNull();
    expect(parseSensitiveStoragePath("https://evil.example/kyc/uid-1/photo.jpg?token=abc")).toBeNull();
    expect(isFirebaseDownloadUrlWithToken("kyc/uid-1/photo.jpg")).toBe(false);
  });

  it("detects download tokens in Storage custom metadata and clears only that key", () => {
    expect(objectHasDownloadToken({ metadata: { firebaseStorageDownloadTokens: "abc" } })).toBe(true);
    expect(objectHasDownloadToken({ metadata: {} })).toBe(false);
    expect(downloadTokenClearMetadata()).toEqual({
      metadata: { firebaseStorageDownloadTokens: null },
    });
  });

  it("scrubs tokenized KYC URL fields to storagePath and does not invent public URLs", () => {
    const plan = planFirestoreScrub({
      email: "user@example.test",
      idImageUrl: TOKEN_URL,
      selfieImageUrl: TOKEN_URL,
      photoUrl: "https://cdn.example/avatar.jpg",
    });
    expect(plan.changed).toBe(true);
    expect(plan.storagePath).toBe("kyc/uid-1/photo.jpg");
    expect(plan.setFields.storagePath).toBe("kyc/uid-1/photo.jpg");
    expect(plan.deleteFields).toEqual(["idImageUrl", "selfieImageUrl"]);
    expect(JSON.stringify(plan.setFields)).not.toMatch(/token=/);
    expect(JSON.stringify(plan.setFields)).not.toMatch(/firebasestorage/);
  });

  it("keeps an existing object-path storagePath and still deletes URL fields", () => {
    const plan = planFirestoreScrub({
      storagePath: "kyc/uid-1/photo.jpg",
      idImageUrl: TOKEN_URL,
    });
    expect(plan.setFields.storagePath).toBeUndefined();
    expect(plan.deleteFields).toEqual(["idImageUrl"]);
    expect(plan.storagePath).toBe("kyc/uid-1/photo.jpg");
  });

  it("does not touch listing photo URLs on profiles", () => {
    const plan = planFirestoreScrub({
      photoUrl:
        "https://firebasestorage.googleapis.com/v0/b/sky-drop-de459.firebasestorage.app/o/listings%2Fuid%2Fpic.jpg?alt=media&token=abc",
      displayName: "Ada",
    });
    expect(plan.changed).toBe(false);
    expect(plan.deleteFields).toEqual([]);
  });
});
