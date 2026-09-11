import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { loginRedirectHref, sanitizeRedirectPath } from "./safe-redirect";
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

  it("builds login hrefs that preserve a safe return path", () => {
    expect(loginRedirectHref("/profile")).toBe("/login?redirect=%2Fprofile");
    expect(loginRedirectHref("/messages")).toBe("/login?redirect=%2Fmessages");
    expect(loginRedirectHref("/messages?conversation=abc")).toBe(
      "/login?redirect=%2Fmessages%3Fconversation%3Dabc"
    );
    expect(loginRedirectHref("https://evil.example")).toBe("/login");
  });

  it("messages page reuses the login return-URL gate instead of rendering the inbox logged out", () => {
    const src = readFileSync(path.join(process.cwd(), "app/messages/page.tsx"), "utf8");
    expect(src).toContain("loginRedirectHref");
    expect(src).toContain("window.location.replace");
    expect(src).toMatch(/if\s*\(\s*!authReady\s*\|\|\s*!user\s*\)/);
    expect(src).toContain("Sign in to view your messages");
  });

  it("profile still gates logged-out users with a login return URL", () => {
    const src = readFileSync(path.join(process.cwd(), "app/profile/ProfileAccountClient.tsx"), "utf8");
    expect(src).toContain("/login?redirect=/profile");
    expect(src).toMatch(/if\s*\(\s*!user\s*\)/);
  });
});
