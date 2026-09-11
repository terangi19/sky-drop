import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("profile onboarding leftovers", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/profile/ProfileAccountClient.tsx"),
    "utf8"
  );

  it("does not treat auth uid as proof the profile exists", () => {
    expect(src).toContain("profileExists: !!(profile.username || profile.email)");
    expect(src).not.toMatch(/profile\.email \|\| user\.uid/);
  });

  it("surfaces profile load failures instead of an empty success state", () => {
    expect(src).toContain("Couldn't load your profile. Please try again.");
  });

  it("does not claim the phone is verified until the server claim succeeds", () => {
    const verifyFn = src.slice(src.indexOf("async function handleVerifyPhoneCode"));
    const successCopy = verifyFn.indexOf('setPhoneMsg("Verified Phone');
    const claimCall = verifyFn.indexOf("claimVerifiedPhoneOnServer");
    const claimFailure = verifyFn.indexOf("!claim.success");
    expect(claimCall).toBeGreaterThan(0);
    expect(claimFailure).toBeGreaterThan(claimCall);
    expect(successCopy).toBeGreaterThan(claimFailure);
  });

  it("keeps Save disabled while the username is invalid", () => {
    expect(src).toContain("disabled={!!saving || !!usernameFieldError}");
  });
});

describe("save-profile username reservation", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/api/save-profile/route.ts"),
    "utf8"
  );

  it("validates username format and reserves inside a transaction", () => {
    expect(src).toContain("parseUsernameForProfileSave");
    expect(src).toContain("runTransaction");
    expect(src).toContain("usernameOwnerState");
    expect(src).not.toMatch(/usernameRef\.set\(\s*\{\s*uid: decodedToken\.uid\s*\}\s*,\s*\{\s*merge:\s*true\s*\}\s*\)/);
  });
});
