import { readFileSync, writeFileSync } from "fs";

const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);

function extractWrite(relPath, maxLine) {
  let content = null;
  for (let i = 0; i < Math.min(lines.length, maxLine); i++) {
    const line = lines[i];
    if (!line.includes(relPath) || !line.includes('"Write"')) continue;
    try {
      const obj = JSON.parse(line);
      for (const part of obj.message?.content ?? []) {
        if (part.name === "Write" && part.input?.path?.replace(/\\/g, "/").includes(relPath)) {
          content = part.input.contents;
          console.log(`Found Write at L${i + 1}: ${content.length} chars`);
        }
      }
    } catch {}
  }
  return content;
}

function extractAllStrReplace(relPath, maxLine, initial) {
  let content = initial;
  let applied = 0;
  for (let i = 0; i < Math.min(lines.length, maxLine); i++) {
    const line = lines[i];
    if (!line.includes(relPath) || !line.includes("StrReplace")) continue;
    try {
      const obj = JSON.parse(line);
      for (const part of obj.message?.content ?? []) {
        if (part.name !== "StrReplace") continue;
        const p = part.input?.path?.replace(/\\/g, "/") ?? "";
        if (!p.includes(relPath)) continue;
        const { old_string, new_string } = part.input ?? {};
        if (typeof old_string !== "string" || typeof new_string !== "string") continue;
        if (!content.includes(old_string)) continue;
        content = content.replace(old_string, new_string);
        applied++;
      }
    } catch {}
  }
  console.log(`Applied ${applied} StrReplace ops`);
  return content;
}

// Try digital page write as vehicles template base
const digital = extractWrite("app/digital/page.tsx", 2639);
if (digital) {
  writeFileSync("C:/Users/rangi/Desktop/sky-drop/sky-drop/scripts/_extracted_digital.tsx", digital);
  console.log("Digital lines:", digital.split(/\r?\n/).length);
}

// Dump line 1509 vehicles strreplace details
for (let i = 0; i < lines.length; i++) {
  if (i + 1 !== 1509) continue;
  const obj = JSON.parse(lines[i]);
  for (const part of obj.message?.content ?? []) {
    if (part.name === "StrReplace" && part.input?.path?.includes("vehicles")) {
      console.log("1509 old len:", part.input.old_string?.length, "new len:", part.input.new_string?.length);
      writeFileSync("C:/Users/rangi/Desktop/sky-drop/sky-drop/scripts/_1509_old.txt", part.input.old_string ?? "");
      writeFileSync("C:/Users/rangi/Desktop/sky-drop/sky-drop/scripts/_1509_new.txt", part.input.new_string ?? "");
    }
  }
}
