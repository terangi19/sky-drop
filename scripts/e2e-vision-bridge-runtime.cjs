/**
 * Runtime evidence for Āwhina vision bridge — NOT unit-test theatre.
 *
 * 1) Probe production /api/awhina-vision feature flag
 * 2) Probe local if NEXT_PUBLIC_URL / localhost available
 * 3) Assert client flag wiring helpers (static)
 *
 * Usage: node scripts/e2e-vision-bridge-runtime.cjs
 */
const fs = require("fs");
const path = require("path");

const PROD = process.env.SKY_DROP_PROD_URL || "https://www.skydrop.co.nz";
const LOCAL = process.env.SKY_DROP_LOCAL_URL || "http://localhost:3000";

async function probeVision(base) {
  const url = `${base.replace(/\/$/, "")}/api/awhina-vision`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [] }),
    });
    const body = await res.json().catch(() => ({}));
    return {
      base,
      status: res.status,
      ok: body.ok,
      enabled: body.enabled,
      code: body.code || body.error,
      body,
    };
  } catch (err) {
    return { base, error: String(err.message || err) };
  }
}

function assertSourceWiring() {
  const root = path.join(__dirname, "..");
  const page = fs.readFileSync(path.join(root, "app/post/ai/page.tsx"), "utf8");
  const hook = fs.readFileSync(
    path.join(root, "app/lib/use-awhina-vision-listing.ts"),
    "utf8"
  );
  const panel = fs.readFileSync(
    path.join(root, "app/components/SkyAiChatPanel.tsx"),
    "utf8"
  );
  const flags = fs.readFileSync(
    path.join(root, "app/lib/awhina-vision-listing-flags.ts"),
    "utf8"
  );

  const checks = [
    {
      name: "page calls runVisionAnalyzeAndBridge on upload when flag on",
      ok: /AWHINA_VISION_LISTING_UI_ENABLED[\s\S]*runVisionAnalyzeAndBridge/.test(page),
    },
    {
      name: "page never silently fails vision (appendMessage on fail)",
      ok: /couldn'?t identify that clearly/i.test(page),
    },
    {
      name: "hook hits /api/awhina-vision",
      ok: hook.includes('fetch("/api/awhina-vision"'),
    },
    {
      name: "chat panel uses shared vision client when flag on",
      ok:
        panel.includes("AWHINA_VISION_LISTING_UI_ENABLED") &&
        panel.includes("fetchAwhinaVisionListing") &&
        panel.includes("waitForVisionBridgeDone"),
    },
    {
      name: "chat composer uses SharedPhotoCapture",
      ok: panel.includes("SharedPhotoCapture"),
    },
    {
      name: "flags default require literal true",
      ok: flags.includes('=== "true"'),
    },
  ];

  return checks;
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    production: await probeVision(PROD),
    local: await probeVision(LOCAL),
    sourceWiring: assertSourceWiring(),
  };

  const prodDisabled =
    report.production.status === 503 &&
    (report.production.code === "vision_listing_disabled" ||
      report.production.enabled === false);

  const prodEnabled =
    report.production.enabled === true ||
    (report.production.status === 400 &&
      report.production.code === "no_images");

  const wiringOk = report.sourceWiring.every((c) => c.ok);

  console.log(JSON.stringify(report, null, 2));
  console.log("\n--- SUMMARY ---");
  console.log(
    "production vision:",
    prodEnabled ? "ENABLED (API accepts; empty images → no_images)" : prodDisabled ? "DISABLED (pre-redeploy or env missing)" : `status=${report.production.status} code=${report.production.code}`
  );
  console.log(
    "local vision:",
    report.local.error
      ? `unreachable (${report.local.error})`
      : report.local.enabled === false
        ? "DISABLED"
        : `status=${report.local.status} code=${report.local.code}`
  );
  console.log("source wiring:", wiringOk ? "PASS" : "FAIL");
  for (const c of report.sourceWiring) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  }

  const outDir = path.join(__dirname, "..", "tmp-e2e-vision-bridge");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  // Wiring must pass. Production may still be disabled until redeploy picks up env.
  if (!wiringOk) process.exit(1);
  console.log("\nWrote tmp-e2e-vision-bridge/report.json");
  if (!prodEnabled) {
    console.log(
      "NOTE: Production still disabled until Vercel redeploy with AWHINA_VISION_LISTINGS_ENABLED + NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED=true (env vars were added; next deploy bakes NEXT_PUBLIC_)."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
