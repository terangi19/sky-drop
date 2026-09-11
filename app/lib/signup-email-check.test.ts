import { describe, expect, it } from "vitest";
import { interpretEmailCheckResponse } from "./signup-email-check";

describe("interpretEmailCheckResponse", () => {
  it("allows a confirmed non-disposable email", () => {
    expect(interpretEmailCheckResponse(true, 200, { disposable: false })).toEqual({
      ok: true,
    });
  });

  it("blocks disposable addresses", () => {
    const result = interpretEmailCheckResponse(true, 200, { disposable: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Temporary email/i);
  });

  it("does not treat HTTP errors as allowed", () => {
    expect(interpretEmailCheckResponse(false, 500, { disposable: false }).ok).toBe(
      false
    );
    expect(interpretEmailCheckResponse(false, 500, {}).ok).toBe(false);
    expect(interpretEmailCheckResponse(false, 429, { error: "Too many requests" })).toEqual(
      {
        ok: false,
        error: "Too many attempts. Please wait a few minutes and try again.",
      }
    );
  });

  it("does not treat a missing disposable flag as allowed", () => {
    const result = interpretEmailCheckResponse(true, 200, {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/couldn't verify your email/i);
  });
});
