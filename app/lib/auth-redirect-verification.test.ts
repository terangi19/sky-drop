import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "./safe-redirect";
import { isVerifiedSignupUser } from "./signup-verification";

describe("auth redirect and verification safeguards", () => {
  it("keeps safe application paths", () => {
    expect(sanitizeRedirectPath("/profile")).toBe("/profile");
    expect(sanitizeRedirectPath("/messages?tab=inbox")).toBe("/messages?tab=inbox");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/%2f%2fevil.example",
    "/%255c%255cevil.example",
    "/\\evil.example",
    "/profile/../login",
    "/%2e%2e/admin",
    "javascript:alert(1)",
    "/profile%00evil",
    "/%5c%5cevil.example",
    "/profile/%2e%2e%2fadmin",
    "/%E0%A4%A",
  ])("rejects unsafe redirect %s", (path) => {
    expect(sanitizeRedirectPath(path)).toBe("");
  });

  it("tracks verification only from Firebase's authoritative flag", () => {
    expect(isVerifiedSignupUser({ emailVerified: false })).toBe(false);
    expect(isVerifiedSignupUser({ emailVerified: true })).toBe(true);
    expect(isVerifiedSignupUser(null)).toBe(false);
  });
});
