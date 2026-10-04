import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library): Turnstile tokens are
 * single-use, so /login must clear the token and remount the widget after the
 * token has been spent (M7) — without weakening the verify step.
 */
const src = readFileSync(path.join(process.cwd(), "app/login/page.tsx"), "utf8");
const handler = src.slice(
  src.indexOf("async function handleLogin"),
  src.indexOf("const signupHref")
);

describe("login Turnstile reset after a spent token (M7)", () => {
  it("tracks a remount key and has a resetTurnstile helper that clears the token", () => {
    expect(src).toContain("const [turnstileKey, setTurnstileKey] = useState(0);");
    const helperAt = src.indexOf("function resetTurnstile()");
    expect(helperAt).toBeGreaterThan(0);
    const helper = src.slice(helperAt, src.indexOf("async function handleLogin"));
    expect(helper).toContain('setTurnstileToken("")');
    expect(helper).toContain("setTurnstileKey((k) => k + 1)");
  });

  it("remounts the widget via key={turnstileKey}", () => {
    expect(src).toMatch(/<TurnstileWidget\s+key=\{turnstileKey\}/);
    expect(src).toContain("onToken={setTurnstileToken}");
  });

  it("resets when server verification fails", () => {
    const failAt = handler.indexOf("Security check failed. Please try again.");
    expect(failAt).toBeGreaterThan(0);
    const after = handler.slice(failAt, failAt + 120);
    expect(after.indexOf("resetTurnstile();")).toBeGreaterThan(-1);
    expect(after.indexOf("resetTurnstile();")).toBeLessThan(after.indexOf("return;"));
  });

  it("resets in the sign-in catch (wrong password burns the verified token)", () => {
    const catchAt = handler.indexOf("} catch (error) {");
    const finallyAt = handler.indexOf("} finally {");
    expect(catchAt).toBeGreaterThan(0);
    const catchBody = handler.slice(catchAt, finallyAt);
    expect(catchBody).toContain("showToast(loginAuthError(error)");
    expect(catchBody).toContain("resetTurnstile();");
  });

  it("does not reset on the success path and still verifies every attempt", () => {
    const tryAt = handler.indexOf("try {");
    const catchAt = handler.indexOf("} catch (error) {");
    expect(handler.slice(tryAt, catchAt)).not.toContain("resetTurnstile");
    // verification is not skipped or cached: every attempt posts the current token
    expect(handler).toContain("await verifyTurnstileToken(turnstileToken)");
    expect(handler).toContain('Complete the security check to continue.');
  });

  it("keeps the #43 login-return behaviour intact", () => {
    expect(src).toContain("sanitizeRedirectPath");
    expect(src).toContain('router.replace(redirectTo || "/")');
    expect(handler).not.toContain("router.");
  });
});
