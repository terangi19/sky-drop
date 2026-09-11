/**
 * Drift protection — fail CI/build if client SDK writes target sensitive collections.
 *
 * Allowed client-safe writes (profiles self, watchlist, typing, funnel analytics, etc.)
 * are ignored. Mutations of messages/listings/purchases/reports/etc. fail the check.
 *
 * Usage: node scripts/check-drift.cjs
 */
const fs = require("fs");
const path = require("path");

const APP_DIR = path.join(__dirname, "..", "app");

/** Collections that must not be mutated from browser code (server-mediated only). */
const SENSITIVE = new Set([
  "messages",
  "conversations",
  "purchases",
  "disputes",
  "reports",
  "reviews",
  "orders",
  "escrow",
  "payments",
]);

/**
 * Client-safe collections / subpaths (allowlist).
 * Intentionally excludes sensitive set above.
 */
const SAFE = new Set([
  "funnelEvents",
  "typing",
  "watchlist",
  "savedSearches",
  "fcmTokens",
  "usernames",
  "profiles",
  "notifications",
  "config",
  "dropTokens",
  "feedback",
  "users",
]);

const WRITE_RE =
  /\b(addDoc|setDoc|updateDoc|deleteDoc)\s*\(\s*(?:collection|doc)\s*\(\s*db\s*,\s*["'`]([^"'`]+)["'`]/g;

const ALLOWED_LISTING_VIEW_INCREMENT =
  /updateDoc\(\s*doc\(\s*db\s*,\s*["'`]listings["'`]\s*,\s*listingId\s*\)\s*,\s*\{\s*views:\s*increment\(1\)/;

const ALLOWED_LISTING_DELETE_OWN =
  /deleteDoc\(\s*doc\(\s*db\s*,\s*["'`]listings["'`]/;

const ALLOWED_TRADE_SHOUT_DELETE =
  /deleteDoc\(\s*doc\(\s*db\s*,\s*["'`]tradeShouts["'`]/;

const ALLOWED_TRADE_POST_OFFER =
  /updateDoc\(\s*doc\(\s*db\s*,\s*["'`]tradePosts["'`]/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "api") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isAllowed(collection, line) {
  if (SAFE.has(collection)) return true;
  if (collection === "listings" && ALLOWED_LISTING_VIEW_INCREMENT.test(line)) return true;
  if (collection === "listings" && ALLOWED_LISTING_DELETE_OWN.test(line)) return true;
  if (collection === "tradeShouts" && ALLOWED_TRADE_SHOUT_DELETE.test(line)) return true;
  if (collection === "tradePosts" && ALLOWED_TRADE_POST_OFFER.test(line)) return true;
  return false;
}

function main() {
  const files = walk(APP_DIR);
  const violations = [];

  for (const file of files) {
    const rel = path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/");
    // Skip server-only paths
    if (rel.includes("/api/") || rel.endsWith(".server.ts") || rel.includes(".server.")) continue;
    const src = fs.readFileSync(file, "utf8");
    // Skip files that only import admin
    if (!src.includes("from") || !/\b(addDoc|setDoc|updateDoc|deleteDoc)\b/.test(src)) continue;
    if (!src.includes('from "firebase/firestore"') && !src.includes("from 'firebase/firestore'") && !src.includes("./firebase") && !src.includes("../lib/firebase") && !src.includes("../../lib/firebase") && !src.includes("../../../lib/firebase")) {
      // still scan — many files import db from local firebase
    }

    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      WRITE_RE.lastIndex = 0;
      let m;
      while ((m = WRITE_RE.exec(line)) !== null) {
        const fn = m[1];
        const collection = m[2];
        if (isAllowed(collection, line)) continue;
        if (SENSITIVE.has(collection) || collection === "listings" || collection === "tradePosts" || collection === "tradeShouts") {
          violations.push({
            file: rel,
            line: i + 1,
            fn,
            collection,
            text: line.trim().slice(0, 160),
          });
        } else if (!SAFE.has(collection)) {
          // Unknown collection write — warn as violation to force review
          violations.push({
            file: rel,
            line: i + 1,
            fn,
            collection,
            text: line.trim().slice(0, 160),
          });
        }
      }
    }
  }

  // Also flag bare addDoc(collection(db, without allowlist
  if (violations.length) {
    console.error("FAIL: Client Firestore writes on sensitive/unknown collections:\n");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.fn} → ${v.collection}`);
      console.error(`    ${v.text}`);
    }
    console.error(
      `\n${violations.length} violation(s). Move mutations to /api/* Admin SDK routes, or extend the allowlist in scripts/check-drift.cjs if genuinely client-safe.`
    );
    process.exit(1);
  }

  console.log("OK: No sensitive client Firestore write drift detected.");

  checkClientServerBoundary();

  const { execSync } = require("child_process");
  execSync("node scripts/check-description-boundary.cjs", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
}

const FORBIDDEN_CLIENT_MODULES = [
  "openai-spend-guard",
  "openai-spending",
  "openai-health",
  "firebase-admin",
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function parseSpecifiers(src) {
  const body = stripComments(src);
  const specs = [];
  const fromRe =
    /\b(?:import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/g;
  const dynRe = /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = fromRe.exec(body)) !== null) {
    specs.push({ typeOnly: Boolean(m[1]), specifier: m[2] });
  }
  while ((m = dynRe.exec(body)) !== null) {
    specs.push({ typeOnly: false, specifier: m[1] });
  }
  return specs;
}

function isForbiddenSpecifier(specifier) {
  const norm = specifier.replace(/\\/g, "/");
  if (norm === "firebase-admin" || norm.startsWith("firebase-admin/")) return "firebase-admin";
  for (const name of FORBIDDEN_CLIENT_MODULES) {
    if (norm === name) return name;
    if (norm.endsWith(`/${name}`) || norm.endsWith(`/${name}.ts`) || norm.endsWith(`/${name}.tsx`)) {
      return name;
    }
    if (norm.endsWith(`/lib/${name}`) || norm.includes(`/lib/${name}.`)) return name;
  }
  return null;
}

function resolveRelative(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function moduleIdFromFile(file) {
  const base = path.basename(file).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  return FORBIDDEN_CLIENT_MODULES.includes(base) ? base : null;
}

/**
 * Fail the build if a Client Component (or anything it imports) pulls in
 * spend-guard / openai-spending / firebase-admin / server openai-health.
 * This is the regression for the 57bfe78 client-bundle break.
 */
function checkClientServerBoundary() {
  const files = walk(APP_DIR);
  const clientEntries = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (/^["']use client["']\s*;?\s*$/m.test(src.split(/\r?\n/).slice(0, 8).join("\n")) || /^\s*["']use client["']/.test(src)) {
      clientEntries.push(file);
    }
  }

  const violations = [];
  const visitedGlobal = new Set();

  for (const entry of clientEntries) {
    const stack = [{ file: entry, chain: [path.relative(path.join(__dirname, ".."), entry).replace(/\\/g, "/")] }];
    const visited = new Set();

    while (stack.length) {
      const { file, chain } = stack.pop();
      const abs = path.resolve(file);
      if (visited.has(abs) || visitedGlobal.has(abs)) continue;
      visited.add(abs);
      visitedGlobal.add(abs);

      const rel = path.relative(path.join(__dirname, ".."), abs).replace(/\\/g, "/");
      if (rel.includes("/api/")) {
        continue;
      }

      const forbiddenFile = moduleIdFromFile(abs);
      if (forbiddenFile) {
        violations.push({
          file: chain[0],
          module: forbiddenFile,
          chain: chain.join(" → "),
        });
        continue;
      }

      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(abs)) continue;
      let src;
      try {
        src = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }

      for (const { specifier } of parseSpecifiers(src)) {
        const forbiddenSpec = isForbiddenSpecifier(specifier);
        if (forbiddenSpec) {
          violations.push({
            file: chain[0],
            module: forbiddenSpec,
            chain: `${chain.join(" → ")} → ${specifier}`,
          });
          continue;
        }
        const resolved = resolveRelative(abs, specifier);
        if (resolved) {
          stack.push({
            file: resolved,
            chain: [...chain, path.relative(path.join(__dirname, ".."), resolved).replace(/\\/g, "/")],
          });
        }
      }
    }
  }

  if (violations.length) {
    console.error("FAIL: Client bundle imports server-only OpenAI/Admin modules:\n");
    const seen = new Set();
    for (const v of violations) {
      const key = `${v.file}|${v.module}|${v.chain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.error(`  ${v.file}`);
      console.error(`    imports ${v.module}`);
      console.error(`    via ${v.chain}`);
    }
    console.error(
      `\n${seen.size} violation(s). Client Components may only fetch /api/sky-ai/status (and other API routes). Do not import openai-spend-guard, openai-spending, openai-health, or firebase-admin into the client bundle.`
    );
    process.exit(1);
  }

  console.log("OK: Client bundle does not import spend-guard, openai-spending, openai-health, or firebase-admin.");
}

main();
