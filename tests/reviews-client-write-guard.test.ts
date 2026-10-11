/**
 * Source guard (PROMPT-8): no client code writes `reviews`. Writes go through /api/submit-review
 * (create) and Admin SDK moderation routes. If a client edit/delete UI is ever wanted, add a server
 * route; don't reopen the rules.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe("no client-side writes to reviews", () => {
  it("client files never pair a reviews ref with a Firestore write", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "app"))) {
      const rel = relative(ROOT, file);
      if (rel.startsWith("app/api/")) continue;
      const src = readFileSync(file, "utf8");
      if (!/from ["']firebase\/firestore["']/.test(src)) continue;
      const writesReviews =
        /(updateDoc|deleteDoc|setDoc|addDoc)\(\s*(doc|collection)\(\s*db\s*,\s*["']reviews["']/.test(src) ||
        (/(doc|collection)\(\s*db\s*,\s*["']reviews["']/.test(src) &&
          /(updateDoc|deleteDoc|setDoc|addDoc|writeBatch|runTransaction)\(/.test(src) &&
          /\b(reviewRef|reviewDoc|reviewsRef)\b/.test(src));
      if (writesReviews) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
