import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("cron and stripe webhook HTTP error sanitizers", () => {
  it("expire-auctions does not return e.message", () => {
    const file = src("app/api/cron/expire-auctions/route.ts");
    expect(file).not.toMatch(/error:\s*e\.message/);
    expect(file).toContain('{ error: "Cron failed" }');
    expect(file).toContain("Bearer ${expectedToken}");
  });

  it("expire-offers does not return e.message", () => {
    const file = src("app/api/cron/expire-offers/route.ts");
    expect(file).not.toMatch(/error:\s*e\.message/);
    expect(file).toContain('{ error: "Cron failed" }');
    expect(file).toContain("Bearer ${expectedToken}");
  });

  it("stripe webhook HTTP body does not echo e.message; ops records still do", () => {
    const file = src("app/api/webhooks/stripe/route.ts");
    expect(file).not.toMatch(/NextResponse\.json\(\{\s*error:\s*e\.message/);
    expect(file).toContain('{ error: "Webhook handler failed" }');
    expect(file).toContain('{ error: "Invalid signature" }');
    expect(file).toMatch(/error:\s*e\.message/);
  });
});