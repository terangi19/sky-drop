import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * PROMPT-14 guard: server routes must not decide admin from an unverified token email.
 * Use isAdminToken / isAdminEmailToken (app/lib/admin-check.server.ts) or requireAdminFromRequest.
 * KNOWN_FOLLOWUPS are files owned by in-flight PRs (#83, #123, #125, prompt-10); convert them after
 * those merge and delete them from this list. The list must only shrink.
 */
const KNOWN_FOLLOWUPS = new Set([
  "app/api/create-notification/route.ts",
  "app/api/send-email/route.ts",
  "app/api/send-notification-email/route.ts",
  "app/api/save-profile/route.ts",
  "app/api/create-test-listing/route.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/route\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const root = process.cwd();
const routes = walk(join(root, "app/api")).map((p) => relative(root, p).split("\\").join("/"));
const TOKEN_EMAIL_ADMIN = /isAdminEmail\(\s*(decoded\w*|token)\??\.email|isAdminUser\(/;

describe("admin decisions use verified email", () => {
  it("no route calls isAdminEmail(<token>.email) or isAdminUser() directly (except known follow-ups)", () => {
    const offenders = routes.filter(
      (r) => !KNOWN_FOLLOWUPS.has(r) && TOKEN_EMAIL_ADMIN.test(readFileSync(join(root, r), "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("known follow-up list only names files that still need converting", () => {
    for (const r of KNOWN_FOLLOWUPS) {
      const src = readFileSync(join(root, r), "utf8");
      expect(/isAdminEmail\(/.test(src), `${r} no longer needs to be on the list`).toBe(true);
    }
  });

  it("requireAdminFromRequest uses isAdminToken", () => {
    const src = readFileSync(join(root, "app/lib/admin-request.ts"), "utf8");
    expect(src).toMatch(/isAdminToken\(decoded\)/);
    expect(src).not.toMatch(/isAdminUser\(/);
  });

  it("firestore.rules isAdmin() requires email_verified for config/adminEmails", () => {
    const rules = readFileSync(join(root, "firestore.rules"), "utf8");
    const fn = rules.slice(rules.indexOf("function isAdmin()"), rules.indexOf("function isEmailVerified()"));
    expect(fn).toMatch(/request\.auth\.token\.email_verified == true\s*&& exists\(/);
  });
});
