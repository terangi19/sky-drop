import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const TARGETS = [
  "app/api/sky-ai/route.ts",
  "app/lib/sky-ai-comps.ts",
  "app/lib/sky-ai-platform-guide.ts",
  "app/lib/sky-ai-safety.ts",
  "app/lib/sky-ai-negotiation.ts",
  "app/lib/sky-ai-types.ts",
  "app/lib/sky-ai-prompts.ts",
  "app/lib/sky-ai-prompt.ts",
  "app/components/SkyAiChat.tsx",
  "app/components/SkyAiPricingCard.tsx",
  "app/components/SkyAiChatPanel.tsx",
];

const MAX_LINE = 2639;

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
const targetSet = new Set(TARGETS);
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
    const { name, input } = part;
    if (!input?.path) continue;
    const rel = normPath(input.path);
    if (!targetSet.has(rel)) continue;
    if (name === "Write" && typeof input.contents === "string") {
      files[rel] = input.contents;
      opCount++;
    } else if (name === "StrReplace" && files[rel] != null) {
      const { old_string, new_string } = input;
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!files[rel].includes(old_string)) continue;
      files[rel] = files[rel].replace(old_string, new_string);
      opCount++;
    }
  }
}

for (const target of TARGETS) {
  const content = files[target];
  if (content == null) {
    console.warn(`SKIP ${target}`);
    continue;
  }
  const outPath = join(root, target);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content, "utf8");
  console.log(`WROTE ${target}: ${content.split(/\r?\n/).length} lines`);
}
console.log(`Done. ${opCount} ops.`);
