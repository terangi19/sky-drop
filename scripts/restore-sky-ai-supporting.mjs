import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const TARGETS = [
  "app/lib/sky-ai-listing-truth.ts",
  "app/lib/sky-ai-title.ts",
  "app/lib/sky-ai-service-description.ts",
  "app/lib/sky-ai-expert-mindset.ts",
  "app/lib/sky-ai-types.ts",
  "app/lib/sky-ai-listing-draft.ts",
];

const MAX_LINE = 2639;
function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
const targetSet = new Set(TARGETS);
import { existsSync } from "fs";
const files = Object.fromEntries(
  TARGETS.map((t) => {
    const p = join(root, t);
    if (existsSync(p)) {
      try {
        return [t, readFileSync(p, "utf8")];
      } catch {
        return [t, null];
      }
    }
    return [t, null];
  })
);

for (let i = 0; i < Math.min(lines.length, MAX_LINE); i++) {
  let obj;
  try {
    obj = JSON.parse(lines[i]);
  } catch {
    continue;
  }
  const content = obj.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part.type !== "tool_use") continue;
    const rel = normPath(part.input?.path || "");
    if (!targetSet.has(rel)) continue;
    if (part.name === "Write" && typeof part.input.contents === "string") {
      files[rel] = part.input.contents;
    } else if (part.name === "StrReplace" && files[rel] != null) {
      const { old_string, new_string } = part.input;
      if (files[rel].includes(old_string)) {
        files[rel] = files[rel].replace(old_string, new_string);
      }
    }
  }
}

for (const [rel, content] of Object.entries(files)) {
  if (!content) {
    console.warn(`SKIP ${rel}`);
    continue;
  }
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content, "utf8");
  console.log(`WROTE ${rel}: ${content.split(/\n/).length} lines`);
}
