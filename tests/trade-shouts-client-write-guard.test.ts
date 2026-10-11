/**
 * Source guard: tradeShouts are created only by /api/create-trade-shout (Admin SDK). firestore.rules
 * denies client create/update; this keeps client code from re-introducing direct writes.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components", "lib", "src"].map((d) => path.join(process.cwd(), d));

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) {
      if (rel === "app/api") continue; // server routes use the Admin SDK
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.server\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const CLIENT_WRITE =
  /\b(addDoc|setDoc|updateDoc)\s*\(\s*(?:collection|doc)\s*\(\s*db\s*,\s*["'`]tradeShouts["'`]/;
const BATCH_WRITE = /\.(set|update)\s*\(\s*doc\s*\(\s*db\s*,\s*["'`]tradeShouts["'`]/;

describe("tradeShouts client write guard", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("scans the client tree (sanity)", () => {
    expect(files.some((f) => f.replace(/\\/g, "/").endsWith("app/trade-feed/page.tsx"))).toBe(true);
  });

  it("no client addDoc/setDoc/updateDoc (or batch set/update) on tradeShouts", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return CLIENT_WRITE.test(src) || BATCH_WRITE.test(src);
    });
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("the shout composer goes through the server route", () => {
    const page = readFileSync(path.join(process.cwd(), "app/trade-feed/page.tsx"), "utf8");
    expect(page).toMatch(/submitTradeFeedRequest\(\{\s*action:\s*"shout"/);
  });
});
