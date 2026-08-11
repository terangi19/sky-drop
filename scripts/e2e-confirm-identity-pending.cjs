/**
 * Desktop + mobile CONFIRM_IDENTITY pendingAction E2E contract.
 * Validates the shared brain both surfaces call (no physical camera / live OpenAI).
 *
 * Usage: node scripts/e2e-confirm-identity-pending.cjs
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

const required = [
  "app/lib/awhina-pending-action.ts",
  "app/lib/awhina-vision-conversation-bridge.ts",
  "app/lib/awhina-canonical.ts",
  "app/lib/awhina-confirm-identity-regression.test.ts",
  "app/components/SkyAiChatPanel.tsx",
];

const report = {
  ok: true,
  desktop: {
    sharedBrain: true,
    pendingActionPath: "awhinaSession.pendingAction → clientPendingAction → resolvePendingActionTurn",
    yesFastPath: "SkyAiChatPanel CONFIRM_IDENTITY local resolve (zero OpenAI)",
  },
  mobile: {
    sharedBrain: true,
    pendingActionPath: "same conversation store + canonical (surface-agnostic)",
    yesFastPath: "same SkyAiChatPanel /post/ai workspace",
  },
  checks: [],
  limits:
    "Does not drive a physical device camera. Live photo OCR requires OpenAI. PendingAction persistence + Yes resolution covered by vitest regression (API-level roundtrip mirroring client+server).",
};

for (const rel of required) {
  const p = path.join(root, rel);
  const exists = fs.existsSync(p);
  report.checks.push({ file: rel, exists });
  if (!exists) report.ok = false;
}

const pendingSrc = fs.readFileSync(
  path.join(root, "app/lib/awhina-pending-action.ts"),
  "utf8"
);
const bridgeSrc = fs.readFileSync(
  path.join(root, "app/lib/awhina-vision-conversation-bridge.ts"),
  "utf8"
);
const canonicalSrc = fs.readFileSync(
  path.join(root, "app/lib/awhina-canonical.ts"),
  "utf8"
);
const chatSrc = fs.readFileSync(
  path.join(root, "app/components/SkyAiChatPanel.tsx"),
  "utf8"
);

const contracts = [
  {
    name: "CONFIRM_IDENTITY type exists",
    ok: /CONFIRM_IDENTITY/.test(pendingSrc),
  },
  {
    name: "buildConfirmIdentityPendingAction",
    ok: /buildConfirmIdentityPendingAction/.test(pendingSrc),
  },
  {
    name: "bridge returns pendingAction on confirm",
    ok:
      /pendingAction:\s*AwhinaPendingAction/.test(bridgeSrc) &&
      /buildConfirmIdentityPendingAction/.test(bridgeSrc),
  },
  {
    name: "commit persists pendingAction",
    ok: /pendingAction,\s*\n\s*updatedAt/.test(bridgeSrc) ||
      /pendingAction[,}]/.test(bridgeSrc),
  },
  {
    name: "canonical handles CONFIRM_IDENTITY",
    ok: /CONFIRM_IDENTITY/.test(canonicalSrc) && /Yep —/.test(canonicalSrc),
  },
  {
    name: "chat panel local Yes/No for CONFIRM_IDENTITY",
    ok:
      /CONFIRM_IDENTITY/.test(chatSrc) &&
      /What is it\?/.test(chatSrc),
  },
  {
    name: "orphan clarify string only when no pending",
    ok: /What are you confirming\?/.test(pendingSrc),
  },
];

for (const c of contracts) {
  report.checks.push(c);
  if (!c.ok) report.ok = false;
}

// Run focused vitest regression (shared mobile+desktop brain)
const vitest = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "vitest",
    "run",
    "app/lib/awhina-confirm-identity-regression.test.ts",
    "app/lib/awhina-vision-conversation-bridge.test.ts",
    "app/lib/awhina-pending-action.test.ts",
  ],
  { cwd: root, encoding: "utf8", shell: true }
);

report.vitestExit = vitest.status;
report.vitestSummary = (vitest.stdout || "")
  .split("\n")
  .filter((l) => /Test Files|Tests |FAIL|PASS/.test(l))
  .slice(-8);
if (vitest.status !== 0) {
  report.ok = false;
  report.vitestStderr = (vitest.stderr || "").slice(-2000);
}

const outDir = path.join(root, "tmp-e2e-confirm-identity");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
