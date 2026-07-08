const { readFileSync, existsSync } = require("fs");
const { join } = require("path");
const root = join(__dirname, "..");
for (const f of [".env.local", ".env.live-eval"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  const line = readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
  if (!line) {
    console.log(`${f}: no OPENAI_API_KEY`);
    continue;
  }
  let v = line.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  console.log(`${f}: ${v.length > 10 ? `set (len ${v.length})` : "empty/placeholder"}`);
}
