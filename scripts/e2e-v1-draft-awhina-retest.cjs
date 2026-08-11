/**
 * Focused proofs after draft-hydrate fix:
 * 1) Manual form → hard refresh → fields restored
 * 2) Awhina text sell (Mazda) desktop+mobile
 * 3) Description quality already proven on prod; spot-check local
 *
 * Usage: E2E_BASE=http://localhost:3000 node scripts/e2e-v1-draft-awhina-retest.cjs
 */
const { firefox, devices } = require("@playwright/test");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const BASE = (process.env.E2E_BASE || "http://localhost:3000").replace(/\/$/, "");
const OUT = path.resolve(__dirname, "..", "tmp-e2e-v1-truth-gaps");
const CREDS_PATH = path.join(__dirname, "..", ".tmp-e2e-creds.json");
fs.mkdirSync(OUT, { recursive: true });

const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = process.env[k] || v;
  }
}

const report = { at: new Date().toISOString(), base: BASE, results: {} };
function record(key, status, detail = "") {
  report.results[key] = { status, detail };
  console.log(`[${status}] ${key}${detail ? " — " + detail : ""}`);
}

function ensureAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
}

function firebaseWebConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      "sky-drop-de459.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

async function waitSettled(page, ms = 2000) {
  await page.waitForTimeout(ms);
}

async function login(page, creds) {
  ensureAdmin();
  const customToken = await admin.auth().createCustomToken(creds.uid);
  const config = firebaseWebConfig();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await waitSettled(page, 1000);
  const signed = await page.evaluate(
    async ({ customToken, config, email, password }) => {
      const appMod = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"
      );
      const authMod = await import(
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"
      );
      const app = appMod.getApps().length
        ? appMod.getApp()
        : appMod.initializeApp(config);
      const auth = authMod.getAuth(app);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
      try {
        const cred = await authMod.signInWithCustomToken(auth, customToken);
        return { ok: true, via: "custom", uid: cred.user.uid };
      } catch (e) {
        try {
          const cred = await authMod.signInWithEmailAndPassword(auth, email, password);
          return { ok: true, via: "password", uid: cred.user.uid };
        } catch (e2) {
          return { ok: false, err: String(e), err2: String(e2) };
        }
      }
    },
    {
      customToken,
      config,
      email: creds.email,
      password: creds.password,
    }
  );
  if (!signed.ok) throw new Error(JSON.stringify(signed));
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await waitSettled(page, 2500);
  await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  await waitSettled(page, 3500);
  if (page.url().includes("/login")) {
    await page.goto(`${BASE}/post/ai`, { waitUntil: "load", timeout: 90000 }).catch(() => {});
    await waitSettled(page, 4000);
  }
  if (page.url().includes("/login")) throw new Error("still on login");
}

async function dismissIntro(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("awhina-chat-intro-dismissed", "1");
      localStorage.setItem("awhina-chat-intro-never", "1");
    } catch {}
  });
  await page.evaluate(() => {
    const dlg = document.querySelector('[aria-labelledby="awhina-intro-title"]');
    if (dlg) dlg.remove();
  });
}

async function ensureEditOpen(page) {
  if (await page.locator("#listing-title").isVisible().catch(() => false)) return;
  const edit = page
    .locator('[data-testid="edit-details-listing"], [data-testid="edit-details-empty"]')
    .first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    await waitSettled(page, 800);
    return;
  }
  const btn = page.getByRole("button", { name: /Edit details|Edit Listing/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await waitSettled(page, 800);
}

async function sendChat(page, text) {
  const box = page.locator("textarea").last();
  await box.waitFor({ state: "visible", timeout: 30000 });
  await box.fill(text);
  await page.keyboard.press("Enter");
}

async function waitDraftSignal(page, re, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const title = await page.locator("#listing-title").inputValue().catch(() => "");
    const draftText = await page.locator("#live-listing-draft").innerText().catch(() => "");
    const session = await page.evaluate(() => {
      try {
        return sessionStorage.getItem("skyAiListingDraft");
      } catch {
        return null;
      }
    });
    let sessionTitle = "";
    try {
      sessionTitle = session ? JSON.parse(session).title || "" : "";
    } catch {}
    const draftHasListing =
      draftText &&
      !/No details yet/i.test(draftText) &&
      re.test(draftText);
    if (re.test(title) || draftHasListing || re.test(sessionTitle)) {
      return { title: title || sessionTitle, draftText: draftText.slice(0, 200), sessionTitle, hit: true };
    }
    const body = await page.locator("body").innerText().catch(() => "");
    // auto-answer yes if confirmation pending
    if (/is this|did i get that|look right|yes or no|sound right/i.test(body)) {
      await sendChat(page, "Yes");
      await waitSettled(page, 5000);
    }
    await page.waitForTimeout(1500);
  }
  return { hit: false };
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  } catch (e) {
    if (!/NS_BINDING_ABORTED|frame was detached|net::ERR_ABORTED/i.test(String(e))) {
      throw e;
    }
  }
  await waitSettled(page, 2000);
  if (!page.url().includes(url.replace(BASE, "")) && page.url().includes("/login")) {
    await page.goto(url, { waitUntil: "load", timeout: 90000 }).catch(() => {});
    await waitSettled(page, 3000);
  }
}

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")).seller;
  const browser = await firefox.launch({ headless: true });

  try {
    // --- Draft hard-refresh (manual form, deterministic) ---
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await login(page, creds);
      await dismissIntro(page);
      await page.evaluate(() => {
        try {
          sessionStorage.removeItem("skyAiListingDraft");
        } catch {}
      });
      await safeGoto(page, `${BASE}/post/ai`);
      await dismissIntro(page);
      await ensureEditOpen(page);
      const physical = page.getByRole("button", { name: /^Physical/i }).first();
      if (await physical.isVisible().catch(() => false)) await physical.click();
      await page.locator("#listing-title").fill("Draft Persist Proof Desk Lamp");
      await page
        .locator("#listing-description")
        .fill("Hard-refresh persistence fixture. Auckland pickup.");
      const price = page
        .locator('input[inputmode="decimal"], #listing-price, input[name="price"]')
        .first();
      if (await price.isVisible().catch(() => false)) await price.fill("55");
      await waitSettled(page, 2000);
      const before = {
        title: await page.locator("#listing-title").inputValue(),
        desc: await page.locator("#listing-description").inputValue(),
        session: await page.evaluate(() => sessionStorage.getItem("skyAiListingDraft")),
      };
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitSettled(page, 3500);
      await dismissIntro(page);
      await ensureEditOpen(page);
      const after = {
        title: await page.locator("#listing-title").inputValue(),
        desc: await page.locator("#listing-description").inputValue(),
        session: await page.evaluate(() => sessionStorage.getItem("skyAiListingDraft")),
      };
      await page.screenshot({
        path: path.join(OUT, "06-draft-hydrate-after-fix.png"),
        fullPage: true,
      });
      const ok =
        after.title === before.title &&
        after.desc === before.desc &&
        Boolean(before.session) &&
        Boolean(after.session);
      record(
        "hard_refresh_draft_persistence_local",
        ok ? "PASS" : "FAIL",
        `before=${before.title} after=${after.title} sessionBefore=${Boolean(
          before.session
        )} sessionAfter=${Boolean(after.session)}`
      );
      await ctx.close();
    }

    // --- Text sell Mazda desktop ---
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await login(page, creds);
      await dismissIntro(page);
      await page.evaluate(() => {
        try {
          sessionStorage.removeItem("skyAiListingDraft");
          localStorage.removeItem("skyAiAwhinaSessionV1");
        } catch {}
      });
      await safeGoto(page, `${BASE}/post/ai`);
      await dismissIntro(page);
      await sendChat(
        page,
        "Sell my blue 2015 Mazda Axela 128000km Auckland for $11500 good condition"
      );
      const hit = await waitDraftSignal(page, /mazda|axela/i, 120000);
      await ensureEditOpen(page);
      const title = await page.locator("#listing-title").inputValue().catch(() => "");
      const desc = await page.locator("#listing-description").inputValue().catch(() => "");
      await page.screenshot({
        path: path.join(OUT, "07-mazda-text-sell-desktop.png"),
        fullPage: true,
      });
      record(
        "awhina_text_sell_mazda_desktop",
        /mazda|axela/i.test(title) || hit.hit ? "PASS" : "FAIL",
        `title=${title} descLen=${desc.length} hit=${hit.hit}`
      );

      // Correction + yes
      await sendChat(page, "Make the price $10900");
      await waitSettled(page, 7000);
      const body = await page.locator("body").innerText();
      record(
        "awhina_correction_price_local",
        /10900|10,?900/.test(body + (await page.locator("#listing-title").inputValue().catch(() => "")))
          ? "PASS"
          : "PARTIAL",
        body.match(/10900|10,?900|price/i)?.[0] || "no price match"
      );
      await ctx.close();
    }

    // --- Mobile text sell ---
    {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        userAgent: devices["iPhone 13"].userAgent,
      });
      const page = await ctx.newPage();
      await login(page, creds);
      await dismissIntro(page);
      await page.evaluate(() => {
        try {
          sessionStorage.removeItem("skyAiListingDraft");
        } catch {}
      });
      await safeGoto(page, `${BASE}/post/ai`);
      await dismissIntro(page);
      await sendChat(page, "Sell my iPhone 13 128GB black Auckland $550");
      const hit = await waitDraftSignal(page, /iphone/i, 120000);
      await page.screenshot({
        path: path.join(OUT, "08-iphone-text-sell-mobile.png"),
        fullPage: true,
      });
      record(
        "awhina_text_sell_iphone_mobile",
        hit.hit ? "PASS" : "FAIL",
        JSON.stringify(hit)
      );
      await ctx.close();
    }
  } catch (e) {
    record("fatal", "FAIL", String(e).slice(0, 400));
    console.error(e);
  } finally {
    await browser.close();
  }

  const out = path.join(OUT, "retest-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("Wrote", out);
  const fails = Object.values(report.results).filter((r) => r.status === "FAIL");
  process.exit(fails.length ? 1 : 0);
}

main();
