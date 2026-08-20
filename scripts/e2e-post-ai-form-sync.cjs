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
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  try {
    await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("skyAiListingDraft");
      } catch {}
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 25000 });

    const composer = page.locator("textarea, [contenteditable='true']").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });

    await composer.fill("I want to sell my iPhone 15 Pro");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

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
      { timeout: 45000 }
    );

    const draft = await page.evaluate(() => {
      const raw = sessionStorage.getItem("skyAiListingDraft");
      return raw ? JSON.parse(raw) : null;
    });
    OUT.draftPrice = draft?.price || null;
    OUT.draftCondition = draft?.condition || null;

    // Visible Listing Details inputs
    const priceInput = page.locator('input[type="number"]').filter({ hasNot: page.locator("[disabled]") }).first();
    // Prefer labeled Price field
    const priceByLabel = page.getByLabel(/price|hourly rate|fixed price/i).first();
    if (await priceByLabel.count()) {
      OUT.price = await priceByLabel.inputValue();
    } else if (await priceInput.count()) {
      OUT.price = await priceInput.inputValue();
    }

    const likeNew = page.getByRole("button", { name: /like new/i }).first();
    if (await likeNew.count()) {
      const cls = (await likeNew.getAttribute("class")) || "";
      OUT.condition = /accent|sky-500|border-\[var\(--accent/i.test(cls)
        ? "Used - Like New"
        : "not-selected";
    }

    const locationInput = page.getByLabel(/location/i).first();
    if (await locationInput.count()) {
      OUT.location = await locationInput.inputValue();
    }

    const desc = page.locator("#listing-description, textarea").filter({ hasText: /iPhone|titanium|battery/i }).first();
    if (await desc.count()) {
      OUT.description = ((await desc.inputValue().catch(() => null)) || (await desc.textContent()) || "").slice(0, 280);
    } else {
      OUT.description = draft?.description || null;
    }

    const priceOk = String(OUT.price || OUT.draftPrice || "") === "1250";
    const condOk = /like\s*new/i.test(String(OUT.condition || OUT.draftCondition || ""));
    const locOk = /auckland/i.test(String(OUT.location || draft?.location || ""));
    const descOk =
      /titanium/i.test(String(OUT.description || "")) &&
      !/pristine|to ensure/i.test(String(OUT.description || ""));

    // Acceptance: visible form preferred; draft is evidence of canonical write
    if (!priceOk) OUT.errors.push("price not 1250 on form/draft");
    if (!condOk) OUT.errors.push("condition not Used - Like New on form/draft");
    if (!locOk) OUT.errors.push("location not Auckland");
    if (!descOk) OUT.errors.push("description missing facts or invented reasoning");

    // Visible form hard requirement when inputs found
    if (OUT.price != null && OUT.price !== "1250") {
      OUT.errors.push(`visible price input is "${OUT.price}"`);
    }
    if (OUT.condition === "not-selected") {
      OUT.errors.push("Like new condition chip not selected");
    }

    OUT.ok = OUT.errors.length === 0;
  } catch (e) {
    OUT.errors.push(String(e && e.message ? e.message : e));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(OUT, null, 2));
  process.exit(OUT.ok ? 0 : 1);
}

main();
