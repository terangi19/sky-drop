const { readFileSync, writeFileSync, existsSync, unlinkSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const tmp = join(root, ".env.openai-tmp");

spawnSync("vercel", ["env", "pull", tmp, "--environment=production", "--yes"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (!existsSync(tmp)) {
  console.log("pull failed");
  process.exit(1);
}

const line = readFileSync(tmp, "utf8").split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
let v = line ? line.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
console.log(`OPENAI_API_KEY length after pull: ${v.length}`);

if (v.length > 10) {
  const localPath = join(root, ".env.local");
  let content = existsSync(localPath) ? readFileSync(localPath, "utf8") : "";
  if (!/^OPENAI_API_KEY=/m.test(content)) {
    content = content.trimEnd() + (content.endsWith("\n") || !content ? "" : "\n") + `OPENAI_API_KEY=${v}\n`;
    writeFileSync(localPath, content);
    console.log("Appended OPENAI_API_KEY to .env.local");
  } else {
    console.log(".env.local already has OPENAI_API_KEY line — not overwriting");
  }
}

try {
  unlinkSync(tmp);
} catch {
  /* ignore */
}
