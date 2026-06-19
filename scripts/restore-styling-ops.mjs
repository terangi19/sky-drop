import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const MIN_LINE = 2601;
const MAX_LINE = 2638;

const TARGETS = new Set([
  "app/globals.css",
  "app/components/MarketplaceListingCard.tsx",
  "app/components/SellerReviewStars.tsx",
  "app/components/Navbar.tsx",
  "app/components/NotificationBell.tsx",
  "app/components/ThemeToggle.tsx",
  "app/page.tsx",
  "app/seller/[username]/page.tsx",
  "app/post/listing/[id]/page.tsx",
  "app/reviews/page.tsx",
  "app/dashboard/page.tsx",
  "app/trade-feed/page.tsx",
  "app/purchases/page.tsx",
]);

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
const files = {};

let opCount = 0;
for (let i = MIN_LINE - 1; i < Math.min(lines.length, MAX_LINE); i++) {
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
    const { name, input } = part;
    if (!input?.path) continue;
    const rel = normPath(input.path);
    if (!TARGETS.has(rel)) continue;

    if (name === "Write" && typeof input.contents === "string") {
      files[rel] = input.contents;
      opCount++;
      console.log(`L${i + 1} Write ${rel}`);
    } else if (name === "StrReplace") {
      if (files[rel] == null) {
        const p = join(root, rel);
        if (existsSync(p)) files[rel] = readFileSync(p, "utf8");
        else continue;
      }
      const { old_string, new_string, replace_all } = input;
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!files[rel].includes(old_string)) {
        console.warn(`L${i + 1} MISS ${rel}: ${old_string.slice(0, 50)}...`);
        continue;
      }
      files[rel] = replace_all
        ? files[rel].split(old_string).join(new_string)
        : files[rel].replace(old_string, new_string);
      opCount++;
      console.log(`L${i + 1} StrReplace ${rel}`);
    }
  }
}

for (const [rel, content] of Object.entries(files)) {
  writeFileSync(join(root, rel), content, "utf8");
  console.log(`WROTE ${rel}`);
}
console.log(`Done. ${opCount} styling ops.`);
