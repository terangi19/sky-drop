#!/usr/bin/env node
/**
 * Wipe Next.js / Turbopack dev caches. Run with the dev server stopped.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const targets = [".next", path.join("node_modules", ".cache")];

for (const rel of targets) {
  const abs = path.join(root, rel);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log(`[clean-dev-cache] removed ${rel}`);
  } catch (err) {
    console.warn(`[clean-dev-cache] could not remove ${rel}:`, err.message);
    console.warn("Stop the dev server (Ctrl+C) and run again.");
    process.exitCode = 1;
  }
}
