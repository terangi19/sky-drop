import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard tests (repo has no jsdom / testing-library), mirroring
 * login-turnstile-reset.test.ts: /signup must clear the single-use Turnstile
 * token and remount the widget once it has been spent (M7 signup follow-up).
 */
const src = readFileSync(path.join(process.cwd(), "app/signup/page.tsx"), "utf8");
const handler = src.slice(
  src.indexOf("async function handleSubmit"),
  src.indexOf("useEffect(() => {", src.indexOf("async function handleSubmit"))
);

describe("signup Turnstile reset after a spent token (M7 follow-up)", () => {
  it("tracks a remount key and has a resetTurnstile helper that clears the token", () => {
    expect(src).toContain("const [turnstileKey, setTurnstileKey] = useState(0);");
    const helperAt = src.indexOf("function resetTurnstile()");
    expect(helperAt).toBeGreaterThan(0);
    const helper = src.slice(helperAt, src.indexOf("async function handleSubmit"));
    expect(helper).toContain('setTurnstileToken("")');
    expect(helper).toContain("setTurnstileKey((k) => k + 1)");
  });

  it("remounts the widget via key={turnstileKey}", () => {
    expect(src).toMatch(/<TurnstileWidget\s+key=\{turnstileKey\}/);
    expect(src).toContain("onToken={setTurnstileToken}");
  });

  it("resets in the submit catch when the token was spent", () => {
    const catchAt = handler.indexOf("} catch (error) {");
    const finallyAt = handler.indexOf("} finally {");
    expect(catchAt).toBeGreaterThan(0);
    const catchBody = handler.slice(catchAt, finallyAt);
    expect(catchBody).toContain("showToast(signupAuthError(error)");
    expect(catchBody).toMatch(/if \(turnstileSpent\) resetTurnstile\(\);/);
  });

  it("tells createSkyDropAccount to report when the token is spent", () => {
    expect(handler).toContain("let turnstileSpent = false;");
    expect(handler).toMatch(/onTurnstileSpent:\s*\(\)\s*=>\s*\{\s*turnstileSpent = true;/);
  });

  it("does not reset on the success path", () => {
    const tryAt = handler.indexOf("try {");
    const catchAt = handler.indexOf("} catch (error) {");
    expect(handler.slice(tryAt, catchAt)).not.toContain("resetTurnstile");
  });

  it("keeps pre-token client validation and the 'complete the security check' gate", () => {
    const gateAt = handler.indexOf("Complete the security check to continue.");
    expect(handler.indexOf("getSignupClientErrors(email, password")).toBeGreaterThan(-1);
    expect(handler.indexOf("getSignupClientErrors(email, password")).toBeLessThan(gateAt);
    expect(handler.indexOf("createSkyDropAccount(")).toBeGreaterThan(gateAt);
  });
});
