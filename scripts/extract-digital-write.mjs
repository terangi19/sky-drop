import { readFileSync, writeFileSync } from "fs";

const transcriptPath =
  "C:/Users/rangi/.cursor/projects/c-Users-rangi-Desktop-sky-drop-sky-drop/agent-transcripts/8f5c3513-fc23-415d-b454-4c68fd606ba2/8f5c3513-fc23-415d-b454-4c68fd606ba2.jsonl";

const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes("digital/page.tsx")) continue;
  try {
    const obj = JSON.parse(line);
    for (const part of obj.message?.content ?? []) {
      if (part.name === "Write" && part.input?.path?.includes("digital")) {
        const c = part.input.contents;
        writeFileSync(
          "C:/Users/rangi/Desktop/sky-drop/sky-drop/scripts/_digital_from_transcript.tsx",
          c
        );
        console.log(`L${i + 1} Write digital: ${c.split(/\r?\n/).length} lines`);
      }
    }
  } catch {}
}

// Extract all vehicles StrReplace new_strings that look like full file chunks (>5000 chars)
for (let i = 0; i < Math.min(lines.length, 2639); i++) {
  const line = lines[i];
  if (!line.includes("vehicles/page.tsx") || !line.includes("StrReplace")) continue;
  try {
    const obj = JSON.parse(line);
    for (const part of obj.message?.content ?? []) {
      if (part.name !== "StrReplace") continue;
      if (!part.input?.path?.includes("vehicles")) continue;
      const ns = part.input.new_string ?? "";
      if (ns.length > 8000) {
        writeFileSync(
          `C:/Users/rangi/Desktop/sky-drop/sky-drop/scripts/_vehicles_L${i + 1}_new.txt`,
          ns
        );
        console.log(`L${i + 1} large new_string: ${ns.length} chars, ${ns.split(/\r?\n/).length} lines`);
      }
    }
  } catch {}
}
