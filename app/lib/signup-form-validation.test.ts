import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  canEnableSignupSubmit,
  getSignupClientErrors,
  isSignupPasswordLongEnough,
  isValidSignupEmail,
} from "./signup-form-validation";

describe("signup client validation", () => {
  it("rejects invalid email formats", () => {
    expect(isValidSignupEmail("")).toBe(false);
    expect(isValidSignupEmail("not-an-email")).toBe(false);
    expect(isValidSignupEmail("a@b")).toBe(false);
    expect(isValidSignupEmail("user@")).toBe(false);
    expect(isValidSignupEmail("@example.com")).toBe(false);
    expect(isValidSignupEmail("user@example")).toBe(false);
  });

  it("accepts a normal email address", () => {
    expect(isValidSignupEmail("you@example.com")).toBe(true);
    expect(isValidSignupEmail("  you@example.com  ")).toBe(true);
  });

  it("requires the app minimum password length", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
    expect(isSignupPasswordLongEnough("short")).toBe(false);
    expect(isSignupPasswordLongEnough("1234567")).toBe(false);
    expect(isSignupPasswordLongEnough("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("shows field errors for filled invalid values without requiring a submit", () => {
    expect(getSignupClientErrors("not-an-email", "short")).toEqual({
      email: "Enter a valid email address.",
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
    expect(getSignupClientErrors("", "")).toEqual({ email: null, password: null });
  });

  it("blocks empty fields when submit is attempted", () => {
    expect(getSignupClientErrors("", "", { requireValues: true })).toEqual({
      email: "Enter a valid email address.",
      password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    });
  });

  it("enables Join free only with valid email, strong password, and accepted terms", () => {
    const valid = {
      email: "you@example.com",
      password: "Password1",
      acceptedTerms: true,
    };
    expect(canEnableSignupSubmit(valid)).toBe(true);
    expect(canEnableSignupSubmit({ ...valid, email: "not-an-email" })).toBe(false);
    expect(canEnableSignupSubmit({ ...valid, password: "short" })).toBe(false);
    expect(canEnableSignupSubmit({ ...valid, acceptedTerms: false })).toBe(false);
    expect(canEnableSignupSubmit({ ...valid, loading: true })).toBe(false);
  });

  it("keeps Join free disabled for long passwords that fail server strength rules", () => {
    const base = {
      email: "you@example.com",
      acceptedTerms: true,
    };
    expect(canEnableSignupSubmit({ ...base, password: "password1" })).toBe(false);
    expect(canEnableSignupSubmit({ ...base, password: " ".repeat(MIN_PASSWORD_LENGTH) })).toBe(false);
    expect(getSignupClientErrors("you@example.com", "password1").password).toMatch(
      /at least 3 of/i
    );
  });
});
