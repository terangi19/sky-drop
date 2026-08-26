/**
 * Browser E2E: Hilux → BMW must not contaminate description/form/draft.
 * Uses real /api/sky-ai (not mocked) against local Next.
 */
const { firefox } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const HILUX =
  "2018 Toyota Hilux SR5 128000km automatic diesel black good condition full service history canopy tow bar Auckland";
const BMW =
  "2007 BMW 335i coupe 145000km automatic grey modified twin turbos intercooler downpipes intakes Auckland good condition";

const STALE = [/toyota/i, /hilux/i, /\bdiesel\b/i, /canopy/i, /tow\s*bar/i, /full service history/i];

async function openSellChat(page) {
  await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("skyAiListingDraft");
    } catch (_) {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const startChat = page.getByRole("button", { name: /Tell Āwhina|Start with Āwhina|Message Āwhina/i }).first();
  if (await startChat.count()) {
    await startChat.click({ timeout: 10_000 }).catch(() => {});
  }
  const chatTab = page.getByRole("button", { name: /^Chat$/i }).first();
  if (await chatTab.count()) await chatTab.click().catch(() => {});
}

async function sendMessage(page, text) {
  const input = page.locator('textarea[placeholder*="Message"]:visible, textarea:visible').first();
  await input.waitFor({ timeout: 30_000 });
  await input.fill(text);
  const send = page.getByRole("button", { name: /^Send$/i }).first();
  await send.click();
}

async function waitForDraft(page, pred, timeout = 45_000) {
  await page.waitForFunction(
    (needle) => {
      const raw = sessionStorage.getItem("skyAiListingDraft");
      if (!raw) return false;
      const d = JSON.parse(raw);
      return new Function("d", `return (${needle})`)(d);
    },
    pred,
    { timeout }
  );
}

async function readDraft(page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "null");
    } catch {
      return null;
    }
  });
}

function assertNoStale(label, text) {
  const blob = String(text || "");
  for (const re of STALE) {
    if (re.test(blob)) {
      throw new Error(`${label} still contains stale Hilux token ${re}: ${blob.slice(0, 240)}`);
    }
  }
}

async function main() {
  const outDir = path.join(__dirname, "..", "tmp-e2e-hilux-bmw");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fills = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/api/sky-ai") || res.request().method() !== "POST") return;
    try {
      const text = await res.text();
      const fillMatch = text.match(/"listingFill"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
      // Prefer SSE done payloads
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.listingFill) fills.push(payload.listingFill);
        } catch (_) {}
      }
      if (!fills.length && fillMatch) {
        try {
          fills.push(JSON.parse(fillMatch[1]));
        } catch (_) {}
      }
    } catch (_) {}
  });

  await openSellChat(page);
  await sendMessage(page, HILUX);
  await waitForDraft(page, "d && /hilux/i.test(String(d.title||d.vehicleModel||''))");
  const afterHilux = await readDraft(page);
  console.log("AFTER HILUX", {
    title: afterHilux?.title,
    make: afterHilux?.vehicleMake,
    model: afterHilux?.vehicleModel,
    extras: afterHilux?.extras,
  });

  await sendMessage(page, BMW);
  await waitForDraft(
    page,
    "d && /bmw|335i/i.test(String(d.title||'')) && /bmw/i.test(String(d.vehicleMake||d.title||''))"
  );
  const afterBmw = await readDraft(page);
  console.log("AFTER BMW", {
    title: afterBmw?.title,
    make: afterBmw?.vehicleMake,
    model: afterBmw?.vehicleModel,
    year: afterBmw?.vehicleYear,
    fuel: afterBmw?.vehicleFuelType,
    extras: afterBmw?.extras,
    desc: afterBmw?.description,
  });

  if (!/bmw/i.test(String(afterBmw?.vehicleMake || afterBmw?.title || ""))) {
    throw new Error("BMW make/title missing after switch");
  }
  assertNoStale("description", afterBmw?.description);
  assertNoStale("extras", (afterBmw?.extras || []).join(" "));
  assertNoStale("title", afterBmw?.title);
  assertNoStale("fuel", afterBmw?.vehicleFuelType);
  if (!/turbo|intercooler|downpipe|intake/i.test((afterBmw?.extras || []).join(" ") + afterBmw?.description)) {
    throw new Error("BMW modifications missing");
  }
  if (/happy to arrange a viewing/i.test(String(afterBmw?.description || ""))) {
    throw new Error("Viewing CTA should not appear on vehicle description");
  }

  // Form title field
  const formTitle = await page.locator("#listing-title, input[name='title'], input[id*='title']").first().inputValue().catch(() => "");
  if (formTitle) {
    assertNoStale("form title", formTitle);
    if (!/bmw|335i/i.test(formTitle)) throw new Error(`Form title not BMW: ${formTitle}`);
  }

  // Refresh hydration
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const afterRefresh = await readDraft(page);
  console.log("AFTER REFRESH", {
    title: afterRefresh?.title,
    make: afterRefresh?.vehicleMake,
    desc: String(afterRefresh?.description || "").slice(0, 160),
  });
  assertNoStale("refresh description", afterRefresh?.description);
  assertNoStale("refresh extras", (afterRefresh?.extras || []).join(" "));
  if (!/bmw|335i/i.test(String(afterRefresh?.title || afterRefresh?.vehicleMake || ""))) {
    throw new Error("Refresh lost BMW identity / restored wrong draft");
  }

  const report = {
    ok: true,
    afterHilux,
    afterBmw,
    afterRefresh,
    networkFills: fills.slice(-2),
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(outDir, "after-bmw.png"), fullPage: true });
  await browser.close();
  console.log("PASS Hilux → BMW browser E2E");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
