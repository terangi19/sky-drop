import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

/** Files to restore from session transcript (before accidental revert) */
const TARGETS = [
  "app/components/MarketplaceListingCard.tsx",
  "app/components/SellerReviewStars.tsx",
  "app/components/ServicePricingBadge.tsx",
  "app/components/Navbar.tsx",
  "app/vehicles/page.tsx",
  "app/digital/page.tsx",
  "app/services/page.tsx",
  "app/rentals/page.tsx",
  "app/page.tsx",
  "app/globals.css",
  "app/lib/service-pricing.ts",
  "app/lib/service-types.ts",
  "app/lib/service-inquiry.ts",
  "app/lib/sky-ai-coach.ts",
  "app/lib/awhina-brand.ts",
  "app/lib/sky-ai-conversation-flow.ts",
  "app/lib/sky-ai-intent-router.ts",
  "app/lib/sky-ai-marketplace-knowledge.ts",
  "app/lib/sky-ai-context-entity.ts",
  "app/lib/sky-ai-listing-draft.ts",
  "app/lib/marketplace-display.ts",
  "app/hooks/useSellerListingMeta.ts",
  "app/lib/listing-card-utils.ts",
  "app/lib/listing-watchlist-count.ts",
  "app/lib/nz-region-cities.ts",
  "app/api/listing-watchlist-count/route.ts",
  "app/api/listing-view/route.ts",
];

const MAX_LINE = 2639;

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
const targetSet = new Set(TARGETS);

const files = Object.fromEntries(
  TARGETS.map((t) => {
    const existing = join(root, t);
    if (existsSync(existing)) {
      try {
        return [t, readFileSync(existing, "utf8")];
      } catch {
        return [t, null];
      }
    }
    return [t, null];
  })
);

let opCount = 0;
const writes = [];

for (let i = 0; i < Math.min(lines.length, MAX_LINE); i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const content = obj.message?.content;
  if (!Array.isArray(content)) continue;

  for (const part of content) {
    if (part.type !== "tool_use") continue;
    const name = part.name;
    const input = part.input;
    if (!input?.path) continue;
    const rel = normPath(input.path);
    if (!targetSet.has(rel)) continue;

    if (name === "Write" && typeof input.contents === "string") {
      files[rel] = input.contents;
      opCount++;
      writes.push(`L${i + 1} Write ${rel}`);
    } else if (name === "StrReplace" && files[rel] != null) {
      const { old_string, new_string } = input;
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!files[rel].includes(old_string)) continue;
      files[rel] = files[rel].replace(old_string, new_string);
      opCount++;
    } else if (name === "StrReplace" && files[rel] == null) {
      // skip — need Write first
    }
  }
}

for (const w of writes) console.log(w);

let wrote = 0;
let skipped = 0;
for (const target of TARGETS) {
  const content = files[target];
  if (content == null) {
    console.warn(`SKIP (no transcript ops): ${target}`);
    skipped++;
    continue;
  }
  const outPath = join(root, target);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf8");
  wrote++;
  console.log(`WROTE ${target}: ${content.split(/\r?\n/).length} lines`);
}

console.log(`Done. ${opCount} ops, ${wrote} files written, ${skipped} skipped.`);
