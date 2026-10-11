/**
 * Source guard (PROMPT-13): follow edges never carry emails, nothing queries the dead `followingId`
 * field, and no client code lists a seller's followers.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const appFiles = walk(join(ROOT, "app"));

describe("followers uid-only guard", () => {
  it("no followerEmail anywhere in app/; follow route writes via followEdgeData", () => {
    expect(appFiles.filter((f) => readFileSync(f, "utf8").includes("followerEmail")).map((f) => relative(ROOT, f))).toEqual([]);
    const route = readFileSync(join(ROOT, "app/api/follow/route.ts"), "utf8");
    expect(route).toContain("followEdgeData(sellerUid, decoded.uid)");
    expect(route).not.toMatch(/sellerEmail|decoded\.email/);
  });
  it("nothing queries the never-written followingId field", () => {
    expect(appFiles.filter((f) => readFileSync(f, "utf8").includes("followingId")).map((f) => relative(ROOT, f))).toEqual([]);
  });
  it("no client code lists followers by sellerId", () => {
    const offenders = appFiles
      .filter((f) => !relative(ROOT, f).startsWith("app/api/") && !f.endsWith(".server.ts"))
      .filter((f) => /collection\(\s*db\s*,\s*["']followers["']\)[\s\S]{0,200}where\(\s*["']sellerId["']/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
