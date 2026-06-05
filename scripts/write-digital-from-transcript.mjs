import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");
const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const MAX_LINE = 2639;
const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);

function normPath(p) {
  return p.replace(/\\/g, "/").replace(/^.*\/sky-drop\//, "");
}

function applyOps(relPath, initial) {
  let content = initial;
  for (let i = 0; i < Math.min(lines.length, MAX_LINE); i++) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    for (const part of obj.message?.content ?? []) {
      if (part.name !== "StrReplace") continue;
      if (normPath(part.input?.path ?? "") !== relPath) continue;
      const { old_string, new_string } = part.input ?? {};
      if (typeof old_string !== "string" || typeof new_string !== "string") continue;
      if (!content.includes(old_string)) continue;
      content = content.replace(old_string, new_string);
    }
  }
  return content;
}

let digital = null;
for (let i = 0; i < MAX_LINE; i++) {
  let obj;
  try {
    obj = JSON.parse(lines[i]);
  } catch {
    continue;
  }
  for (const part of obj.message?.content ?? []) {
    if (part.name === "Write" && normPath(part.input?.path ?? "") === "app/digital/page.tsx") {
      digital = part.input.contents;
      console.log(`Found digital Write L${i + 1}: ${digital.split(/\r?\n/).length} lines`);
    }
  }
}

if (!digital) {
  console.error("Digital Write not found in transcript — clone from vehicles instead");
  process.exit(1);
}

digital = applyOps("app/digital/page.tsx", digital);
writeFileSync(join(root, "app/digital/page.tsx"), digital, "utf8");
console.log(`Wrote app/digital/page.tsx (${digital.split(/\r?\n/).length} lines)`);
