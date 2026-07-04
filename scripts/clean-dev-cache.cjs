#!/usr/bin/env node
/**
 * Wipe Next.js / Turbopack dev caches. Run with the dev server stopped.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = [".next", path.join("node_modules", ".cache")];

console.log("[clean-dev-cache] Stop the dev server (Ctrl+C) before cleaning.\n");

for (const rel of targets) {
  const abs = path.join(root, rel);
  try {
    if (fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      console.log(`[clean-dev-cache] removed ${rel}`);
    } else {
      console.log(`[clean-dev-cache] skip ${rel} (not present)`);
    }
  } catch (err) {
    console.error(`[clean-dev-cache] FAILED to remove ${rel}: ${err.message}`);
    console.error("Stop `next dev` / Turbopack, then run: npm run dev:clean");
    process.exit(1);
  }
}

console.log("\n[clean-dev-cache] Done. Start with: npm run dev");
