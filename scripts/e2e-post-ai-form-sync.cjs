/**
 * Fast /post/ai form sync browser check against local or prod.
 * Usage: node scripts/e2e-post-ai-form-sync.cjs [baseUrl]
 * Default: http://127.0.0.1:3000 — pass https://skydrop.co.nz for prod.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = {
  ok: false,
  base: BASE,
  price: null,
  condition: null,
  location: null,
  description: null,
  draftPrice: null,
  draftCondition: null,
  errors: [],
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);

  try {
    await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("skyAiListingDraft");
      } catch {}
    });
    // Soft navigation refresh without full crash-prone reload
    await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 25000 });

    const composer = page.locator("textarea[placeholder*='Āwhina'], textarea[placeholder*='Awhina'], textarea[placeholder*='selling']").first();
    await composer.waitFor({ state: "visible", timeout: 20000 });

    await composer.click();
    await composer.fill("I want to sell my iPhone 15 Pro");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);

    await composer.fill(
      "256GB, Natural Titanium, like-new condition, $1,250, Auckland. Battery health is 94%. Comes with the original box and USB-C cable. Always used with a case and screen protector. No cracks, faults or repairs."
    );
    await page.keyboard.press("Enter");

    // Wait for draft price to land in sessionStorage (canonical) then form
    await page.waitForFunction(
      () => {
        try {
          const raw = sessionStorage.getItem("skyAiListingDraft");
          if (!raw) return false;
          const d = JSON.parse(raw);
          return String(d.price || "") === "1250" && /like\s*new/i.test(String(d.condition || ""));
        } catch {
          return false;
        }
      },
      { timeout: 60000 }
    );

    const draft = await page.evaluate(() => {
      const raw = sessionStorage.getItem("skyAiListingDraft");
      return raw ? JSON.parse(raw) : null;
    });
    OUT.draftPrice = draft?.price || null;
    OUT.draftCondition = draft?.condition || null;

    // Scroll listing details into view
    await page.locator("text=Listing Details").first().scrollIntoViewIfNeeded().catch(() => {});

    const priceCandidates = page.locator('input[type="number"]');
    const priceCount = await priceCandidates.count();
    for (let i = 0; i < priceCount; i++) {
      const val = await priceCandidates.nth(i).inputValue();
      if (val && val !== "0") {
        OUT.price = val;
        break;
      }
    }
    if (!OUT.price && priceCount > 0) {
      OUT.price = await priceCandidates.first().inputValue();
    }

    const likeNew = page.getByRole("button", { name: /^Like new$/i }).first();
    if (await likeNew.count()) {
      const cls = (await likeNew.getAttribute("class")) || "";
      OUT.condition = /accent|sky-500|border-\[var\(--accent|bg-\[var\(--accent/i.test(cls)
        ? "Used - Like New"
        : "not-selected";
      // Also check aria / pressed
      const pressed = await likeNew.getAttribute("aria-pressed");
      if (pressed === "true") OUT.condition = "Used - Like New";
    }
    if (draft?.condition) {
      // Prefer draft if chip styling ambiguous but draft is correct
      if (OUT.condition === "not-selected" && /like\s*new/i.test(draft.condition)) {
        // still fail visible — keep not-selected
      }
    }

    const locationInput = page.locator('input[placeholder*="Auckland"], input[name*="location" i]').first();
    if (await locationInput.count()) {
      OUT.location = await locationInput.inputValue();
    } else {
      OUT.location = draft?.location || null;
    }

    const descArea = page.locator("#listing-description, textarea").nth(0);
    // Prefer listing description field (not chat)
    const allTextareas = page.locator("textarea");
    const taCount = await allTextareas.count();
    for (let i = 0; i < taCount; i++) {
      const val = await allTextareas.nth(i).inputValue().catch(() => "");
      if (/iPhone|titanium|battery/i.test(val)) {
        OUT.description = val.slice(0, 320);
        break;
      }
    }
    if (!OUT.description) OUT.description = draft?.description || null;

    const priceOk = String(OUT.price || "") === "1250" || String(OUT.draftPrice || "") === "1250";
    const condOk = /like\s*new/i.test(String(OUT.condition || OUT.draftCondition || ""));
    const locOk = /auckland/i.test(String(OUT.location || draft?.location || ""));
    const descOk =
      /titanium/i.test(String(OUT.description || "")) &&
      !/pristine|to ensure/i.test(String(OUT.description || ""));

    if (String(OUT.draftPrice) !== "1250") OUT.errors.push("draft price not 1250");
    if (!/like\s*new/i.test(String(OUT.draftCondition || ""))) {
      OUT.errors.push("draft condition not Used - Like New");
    }
    if (String(OUT.price) !== "1250") {
      OUT.errors.push(`visible price input is "${OUT.price}" (want 1250)`);
    }
    if (OUT.condition === "not-selected" || !/like\s*new/i.test(String(OUT.condition || ""))) {
      OUT.errors.push(`visible condition is "${OUT.condition}"`);
    }
    if (!locOk) OUT.errors.push("location not Auckland");
    if (!descOk) OUT.errors.push("description missing facts or invented reasoning");

    OUT.ok = OUT.errors.length === 0 && priceOk && condOk;
  } catch (e) {
    OUT.errors.push(String(e && e.message ? e.message : e));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(OUT, null, 2));
  process.exit(OUT.ok ? 0 : 1);
}

main();
