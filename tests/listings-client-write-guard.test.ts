/**
 * Source guard: listings are created/updated only by Admin SDK routes (/api/create-listing,
 * /api/update-listing, place-bid, payments, crons). firestore.rules denies client create/update;
 * this keeps client code from re-introducing direct listing writes that would silently fail.
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

const COLLECTIONS = "listings|drops|promotions|hustlerLinks|hustlerEvents|hustlerClicks";
const CLIENT_WRITE = new RegExp(
  `\\b(addDoc|setDoc|updateDoc)\\s*\\(\\s*(?:collection|doc)\\s*\\(\\s*db\\s*,\\s*["'\`](${COLLECTIONS})["'\`]`
);
const BATCH_WRITE = new RegExp(`\\.(set|update)\\s*\\(\\s*doc\\s*\\(\\s*db\\s*,\\s*["'\`](${COLLECTIONS})["'\`]`);

// Known dynamic-collection writer: PromoteModal's promotedUntil write is denied by the rules on
// purpose until promotion moves server-side (Stripe webhook). Do not add entries here.
const DYNAMIC_ALLOW = new Set(["app/components/PromoteModal.tsx"]);
const DYNAMIC_WRITE = /\b(addDoc|setDoc|updateDoc)\s*\(\s*doc\s*\(\s*db\s*,\s*collectionName\b/;

describe("listings client write guard", () => {
  const files = ROOTS.flatMap((r) => walk(r));
  const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, "/");

  it("scans the client tree (sanity)", () => {
    expect(files.some((f) => rel(f) === "app/post/edit/[id]/page.tsx")).toBe(true);
  });

  it("no client addDoc/setDoc/updateDoc (or batch set/update) on listings or unused public collections", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return CLIENT_WRITE.test(src) || BATCH_WRITE.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no new dynamic-collection client writers", () => {
    const offenders = files
      .filter((f) => DYNAMIC_WRITE.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((f) => !DYNAMIC_ALLOW.has(f));
    expect(offenders).toEqual([]);
  });

  it("listing create and edit go through the server routes", () => {
    const edit = readFileSync(path.join(process.cwd(), "app/post/edit/[id]/page.tsx"), "utf8");
    expect(edit).toMatch(/fetch\("\/api\/update-listing"/);
    const createCallers = files.filter((f) => /\/api\/create-listing/.test(readFileSync(f, "utf8")));
    expect(createCallers.length).toBeGreaterThan(0);
  });
});
