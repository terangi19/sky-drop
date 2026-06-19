import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const TARGETS = [
  "app/components/MarketplaceListingCard.tsx",
  "app/vehicles/page.tsx",
];

const MAX_LINE = 2639; // before "spot is retarded" user message

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
const BOOTSTRAP = {
  "app/vehicles/page.tsx": join(root, "app/vehicles/page.tsx"),
};

const files = Object.fromEntries(
  TARGETS.map((t) => {
    const boot = BOOTSTRAP[t];
    if (boot) {
      try {
        return [t, readFileSync(boot, "utf8")];
      } catch {
        return [t, null];
      }
    }
    return [t, null];
  })
);

let opCount = 0;
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
    if (!TARGETS.includes(rel)) continue;

    if (name === "Write" && typeof input.contents === "string") {
      files[rel] = input.contents;
      opCount++;
      console.log(`L${i + 1} Write ${rel} (${input.contents.length} chars)`);
    } else if (name === "StrReplace" && files[rel] != null) {
      const { old_string, new_string } = input;
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!files[rel].includes(old_string)) {
        console.warn(`L${i + 1} StrReplace MISS on ${rel}: old_string not found (${old_string.slice(0, 60)}...)`);
        continue;
      }
      files[rel] = files[rel].replace(old_string, new_string);
      opCount++;
      console.log(`L${i + 1} StrReplace ${rel}`);
    } else if (name === "StrReplace" && files[rel] == null) {
      console.warn(`L${i + 1} StrReplace skipped (no base) ${rel}`);
    }
  }
}

for (const target of TARGETS) {
  const content = files[target];
  if (content == null) {
    console.error(`FAILED: no content for ${target}`);
    process.exit(1);
  }
  const outPath = join(root, target);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf8");
  const lineCount = content.split(/\r?\n/).length;
  console.log(`WROTE ${target}: ${lineCount} lines, ${content.length} chars`);
}

console.log(`Done. ${opCount} operations applied.`);
