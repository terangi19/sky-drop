const fs = require("fs");
const path = require("path");

const file = process.argv[2] || ".env.vercel.production";
const text = fs.readFileSync(path.resolve(file), "utf8");

const names = [
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_KEY",
  "NEXT_PUBLIC_URL",
];

function mode(v) {
  if (!v) return "empty";
  if (v.startsWith("pk_test_") || v.startsWith("sk_test_")) return "test";
  if (v.startsWith("pk_live_") || v.startsWith("sk_live_")) return "LIVE";
  if (v.startsWith("whsec_")) return "webhook-secret";
  return "unknown";
}

for (const name of names) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) {
    console.log(`${name}: MISSING`);
    continue;
  }
  const v = m[1].trim().replace(/^"|"$/g, "");
  console.log(`${name}: ${mode(v)} prefix=${v ? v.slice(0, 12) + "..." : "(empty)"}`);
}
