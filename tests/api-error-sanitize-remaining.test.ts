import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("remaining API error sanitizers", () => {
  it("arrange-purchase logs the server error and returns a generic 500", () => {
    const file = src("app/api/arrange-purchase/route.ts");
    expect(file).not.toMatch(/\{\s*error:\s*msg\s*\}/);
    expect(file).not.toMatch(/\{\s*error:\s*message\s*\}/);
    expect(file).not.toMatch(/message\.length\s*<\s*200/);
    expect(file).toContain('console.error("[arrange-purchase]", msg)');
    expect(file).toContain('{ error: "Failed to arrange purchase" }');
  });

  it("confirm-arrange-sale returns only allowlisted messages", () => {
    const file = src("app/api/confirm-arrange-sale/route.ts");
    expect(file).not.toMatch(/\{\s*error:\s*msg\s*\}/);
    expect(file).not.toMatch(/\{\s*error:\s*message\s*\}/);
    expect(file).not.toMatch(/message\.length\s*<\s*200/);
    expect(file).not.toContain('msg.includes("not found")');
    expect(file).toContain('{ error: "Purchase not found" }, { status: 404 }');
    expect(file).toContain('{ error: "Listing not found" }, { status: 404 }');
    expect(file).toContain(
      '{ error: "Only the seller can confirm this sale" }, { status: 403 }'
    );
    expect(file).toContain('{ error: "This is not an Arrange Purchase order" }, { status: 400 }');
    expect(file).toContain('{ error: "This purchase cannot be confirmed" }, { status: 400 }');
    expect(file).toContain('{ error: "This listing has already been sold" }, { status: 400 }');
    expect(file).toContain('{ error: "This listing is no longer available" }, { status: 400 }');
    expect(file).toContain('{ error: "This item is out of stock" }, { status: 400 }');
    expect(file).toContain('{ error: "Failed to confirm sale" }, { status: 500 }');
  });

  it("create-listing no longer echoes short exception text", () => {
    const file = src("app/api/create-listing/route.ts");
    expect(file).not.toContain("message.length < 200");
    expect(file).not.toMatch(/\{\s*error:\s*message\s*\}/);
    expect(file).not.toMatch(/\{\s*error:\s*msg\s*\}/);
    expect(file).not.toMatch(/\{\s*error:\s*safeMessage\s*\}/);
    expect(file.match(/instanceof CsrfError/g)).toHaveLength(1);
    expect(file).toContain('{ error: "CSRF token validation failed" }');
    expect(file).toContain('{ error: "Failed to create listing" }');
    expect(file).toContain('{ error: "Could not save listing. Try again or contact support." }');
  });

  it("save-profile keeps the NOT_FOUND and CSRF cases and hides the rest", () => {
    const file = src("app/api/save-profile/route.ts");
    expect(file).not.toMatch(/\{\s*error:\s*message\s*\}/);
    expect(file).not.toMatch(/\{\s*error:\s*msg\s*\}/);
    expect(file).not.toMatch(/message\.length\s*<\s*200/);
    expect(file).toContain('message.includes("NOT_FOUND")');
    expect(file).toContain('{ error: "Profile document missing — try saving again." }');
    expect(file.match(/instanceof CsrfError/g)).toHaveLength(1);
    expect(file).toContain('{ error: "CSRF token validation failed" }');
    expect(file).toContain('{ error: "Failed to save profile" }');
  });
});
