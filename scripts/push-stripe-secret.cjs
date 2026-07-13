const fs = require("fs");
const { spawnSync } = require("child_process");

const text = fs.readFileSync(".env.local", "utf8");
function read(name) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

const secret = read("STRIPE_SECRET_KEY");
if (!secret.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY is not sk_test_");
  process.exit(1);
}

const r = spawnSync(
  "vercel",
  ["env", "update", "STRIPE_SECRET_KEY", "production", "--yes", "--value", secret, "--sensitive"],
  { stdio: "inherit", shell: true }
);
process.exit(r.status ?? 1);
