/**
 * Push Stripe test keys from .env.local to Vercel production (non-interactive).
 * Usage: node scripts/push-stripe-test-env.cjs [--dry-run]
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dryRun = process.argv.includes("--dry-run");
const envPath = path.resolve(".env.local");
const text = fs.readFileSync(envPath, "utf8");

function readEnv(name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^"|"$/g, "");
}

const updates = [
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
];

function assertTestKey(name, value) {
  if (!value) throw new Error(`${name} missing in .env.local`);
  if (name.includes("PUBLISHABLE") && !value.startsWith("pk_test_")) {
    throw new Error(`${name} must be a pk_test_ key, got prefix ${value.slice(0, 8)}`);
  }
  if (name === "STRIPE_SECRET_KEY" && !value.startsWith("sk_test_")) {
    throw new Error(`${name} must be a sk_test_ key, got prefix ${value.slice(0, 8)}`);
  }
}

for (const name of updates) {
  const value = readEnv(name);
  assertTestKey(name, value);
  console.log(`[stripe-env] ${name} → production (${value.slice(0, 12)}...)`);
  if (dryRun) continue;

  const result = spawnSync(
    "vercel",
    ["env", "update", name, "production", "--yes", "--value", value, "--sensitive"],
    { stdio: "inherit", shell: true, cwd: process.cwd() }
  );
  if (result.status !== 0) {
    console.error(`[stripe-env] Failed to update ${name}`);
    process.exit(result.status || 1);
  }
}

console.log("[stripe-env] Done. Redeploy production for NEXT_PUBLIC_* to reach the client bundle.");
