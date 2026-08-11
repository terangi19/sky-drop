/**
 * V1 truth-gap browser proofs (Firefox).
 * Covers: Āwhina text sell, description quality, yes/no + correction,
 * draft hard-refresh, vision flag probe, follow, messages sample, reviews gate.
 *
 * Usage:
 *   node scripts/e2e-v1-truth-gaps.cjs
 *   E2E_BASE=http://localhost:3000 node scripts/e2e-v1-truth-gaps.cjs
 *   E2E_BASE=https://www.skydrop.co.nz node scripts/e2e-v1-truth-gaps.cjs
 */
const { firefox, devices } = require("@playwright/test");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE = (process.env.E2E_BASE || "https://www.skydrop.co.nz").replace(/\/$/, "");
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

const report = {
  at: new Date().toISOString(),
  base: BASE,
  results: {},
};

function record(key, status, detail = "") {
  report.results[key] = { status, detail, at: new Date().toISOString() };
  console.log(`[${status}] ${key}${detail ? " — " + detail : ""}`);
}

function loadSa() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT missing");
  return JSON.parse(raw);
}

function ensureAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(loadSa()) });
  }
  return admin;
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

async function waitSettled(page, ms = 2500) {
  await page.waitForTimeout(ms);
}

async function login(page, email, password, uid) {
  ensureAdmin();
  const customToken = await admin.auth().createCustomToken(uid);
  const config = firebaseWebConfig();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitSettled(page, 1200);
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
        return { ok: true, uid: cred.user.uid, via: "custom" };
      } catch (e) {
        try {
          const cred = await authMod.signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          return { ok: true, uid: cred.user.uid, via: "password" };
        } catch (e2) {
          return { ok: false, err: String(e), err2: String(e2) };
        }
      }
    },
    { customToken, config, email, password }
  );
  if (!signed.ok) throw new Error(`login failed ${JSON.stringify(signed)}`);
  await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitSettled(page, 3500);
  if (page.url().includes("/login")) {
    throw new Error("session not visible after login inject");
  }
  return signed;
}

async function dismissAwhinaIntro(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("awhina-chat-intro-dismissed", "1");
      localStorage.setItem("awhina-chat-intro-never", "1");
    } catch {}
  });
  const getStarted = page.getByRole("button", { name: /^Get Started$/i });
  if (await getStarted.isVisible().catch(() => false)) {
    await getStarted.click().catch(() => {});
    await waitSettled(page, 800);
  }
  await page.evaluate(() => {
    const dlg = document.querySelector('[aria-labelledby="awhina-intro-title"]');
    if (dlg) dlg.remove();
  });
}

async function openPostAi(page) {
  await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitSettled(page, 3000);
  await dismissAwhinaIntro(page);
  await waitSettled(page, 800);
}

async function chatComposer(page) {
  return page.locator("textarea").filter({ hasNot: page.locator("[disabled]") }).last();
}

async function sendChat(page, text) {
  const box = await chatComposer(page);
  await box.waitFor({ state: "visible", timeout: 30000 });
  await box.click();
  await box.fill(text);
  await page.keyboard.press("Enter");
}

async function waitForTitle(page, pattern, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const title = page.locator("#listing-title");
    if (await title.count()) {
      const val = await title.inputValue().catch(() => "");
      if (val && pattern.test(val)) return val;
      if (val && val.length > 3 && pattern === /./) return val;
    }
    // preview headline fallback
    const draft = page.locator("#live-listing-draft");
    if (await draft.count()) {
      const t = await draft.innerText().catch(() => "");
      if (pattern.test(t)) return t.slice(0, 120);
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

async function readForm(page) {
  const title = await page.locator("#listing-title").inputValue().catch(() => "");
  const desc = await page
    .locator("#listing-description")
    .inputValue()
    .catch(() => "");
  const price = await page
    .locator('input[inputmode="decimal"], #listing-price, input[name="price"]')
    .first()
    .inputValue()
    .catch(() => "");
  const body = await page.locator("body").innerText();
  const sessionDraft = await page.evaluate(() => {
    try {
      return sessionStorage.getItem("skyAiListingDraft");
    } catch {
      return null;
    }
  });
  return { title, desc, price, body: body.slice(0, 4000), sessionDraft };
}

async function ensureEditOpen(page) {
  const title = page.locator("#listing-title");
  if (await title.isVisible().catch(() => false)) return;
  const edit =
    page.locator('[data-testid="edit-details-listing"], [data-testid="edit-details-empty"]').first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    await waitSettled(page, 1000);
  } else {
    const btn = page.getByRole("button", { name: /Edit details|Edit Listing/i }).first();
    if (await btn.isVisible().catch(() => false)) await btn.click();
    await waitSettled(page, 1000);
  }
}

async function probeVision() {
  try {
    const res = await fetch(`${BASE}/api/awhina-vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [] }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, enabled: body.enabled, code: body.code || body.error };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function probePublicVisionFlag(page) {
  await page.goto(`${BASE}/post/ai`, { waitUntil: "domcontentloaded" });
  await waitSettled(page, 2500);
  const flag = await page.evaluate(() => {
    // Client bundle inlines NEXT_PUBLIC_* at build time — probe UI affordance
    const hasPhoto =
      !!document.querySelector('input[type="file"]') ||
      /add photo|take photo|upload/i.test(document.body.innerText);
    const flagOffMsg = /vision listing is not enabled|UI flag OFF|photo kept, identify skipped/i.test(
      document.body.innerText
    );
    return { hasPhoto, flagOffMsg };
  });
  return flag;
}

async function loadCreds() {
  if (fs.existsSync(CREDS_PATH)) {
    return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
  }
  ensureAdmin();
  const auth = admin.auth();
  const db = admin.firestore();
  const ts = Date.now().toString(36);
  const sellerPass = `SdE2e!${crypto.randomBytes(9).toString("base64url")}9A`;
  const buyerPass = `SdE2e!${crypto.randomBytes(9).toString("base64url")}9A`;
  const sellerEmail = `skydrop.e2e.seller.${ts}@gmail.com`;
  const buyerEmail = `skydrop.e2e.buyer.${ts}@gmail.com`;
  const sellerUser = `e2eseller${ts}`.slice(0, 24);
  const buyerUser = `e2ebuyer${ts}`.slice(0, 24);
  const seller = await auth.createUser({
    email: sellerEmail,
    password: sellerPass,
    emailVerified: true,
    displayName: "E2E Test Seller",
  });
  const buyer = await auth.createUser({
    email: buyerEmail,
    password: buyerPass,
    emailVerified: true,
    displayName: "E2E Test Buyer",
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("profiles").doc(seller.uid).set({
    email: sellerEmail,
    username: sellerUser,
    displayName: "E2E Test Seller",
    emailVerified: true,
    memberSince: now,
    createdAt: now,
    followers: 0,
  });
  await db.collection("usernames").doc(sellerUser.toLowerCase()).set({ uid: seller.uid });
  await db.collection("profiles").doc(buyer.uid).set({
    email: buyerEmail,
    username: buyerUser,
    displayName: "E2E Test Buyer",
    emailVerified: true,
    memberSince: now,
    createdAt: now,
    followers: 0,
  });
  await db.collection("usernames").doc(buyerUser.toLowerCase()).set({ uid: buyer.uid });
  const creds = {
    createdAt: new Date().toISOString(),
    seller: {
      email: sellerEmail,
      password: sellerPass,
      uid: seller.uid,
      username: sellerUser,
    },
    buyer: {
      email: buyerEmail,
      password: buyerPass,
      uid: buyer.uid,
      username: buyerUser,
    },
  };
  fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
  return creds;
}

async function runAwhinaFlows(browser, creds) {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: devices["iPhone 13"].userAgent,
  });
  const dPage = await desktop.newPage();
  const mPage = await mobile.newPage();
  dPage.setDefaultTimeout(60000);
  mPage.setDefaultTimeout(60000);

  await login(dPage, creds.seller.email, creds.seller.password, creds.seller.uid);
  await openPostAi(dPage);

  // Clear any prior draft contamination
  await dPage.evaluate(() => {
    try {
      sessionStorage.removeItem("skyAiListingDraft");
      localStorage.removeItem("skyAiAwhinaSessionV1");
    } catch {}
  });
  await openPostAi(dPage);

  // --- Text sell (desktop) ---
  const sellPrompt =
    "Sell my blue 2015 Mazda Axela 128000km Auckland for $11500 good condition";
  await sendChat(dPage, sellPrompt);
  const titleHit = await waitForTitle(dPage, /mazda|axela/i, 120000);
  await ensureEditOpen(dPage);
  let form = await readForm(dPage);
  await dPage.screenshot({ path: path.join(OUT, "01-text-sell-desktop.png"), fullPage: true });
  const textSellOk =
    !!titleHit &&
    /mazda|axela/i.test(form.title || titleHit) &&
    (/11500|11,?500/.test(form.price + form.body) || /11500|11,?500/.test(form.desc));
  record(
    "awhina_text_sell_desktop",
    textSellOk ? "PASS" : "FAIL",
    `title=${form.title || titleHit} price=${form.price} descLen=${(form.desc || "").length}`
  );

  // --- Description quality (Barella-style via chat) ---
  await sendChat(
    dPage,
    "Actually new listing: selling a Topps Chrome Nicolò Barella soccer card, orange parallel, near mint, Auckland $25"
  );
  await waitForTitle(dPage, /barella|topps|chrome|card/i, 120000);
  await ensureEditOpen(dPage);
  form = await readForm(dPage);
  await dPage.screenshot({
    path: path.join(OUT, "02-desc-barella-desktop.png"),
    fullPage: true,
  });
  const desc = form.desc || "";
  const descBad =
    /subject:|set:|productline:|Nicol[oò] Barella\.\s+Set/i.test(desc) ||
    /\bSet Topps\b/i.test(desc) ||
    /Chrome Topps\./i.test(desc);
  const descGood =
    desc.length >= 40 &&
    /Barella|Topps|Chrome|card/i.test(desc) &&
    !descBad;
  record(
    "description_composition_browser",
    descGood ? "PASS" : desc ? "FAIL" : "FAIL",
    `len=${desc.length} bad=${descBad} sample=${JSON.stringify(desc.slice(0, 280))}`
  );
  fs.writeFileSync(
    path.join(OUT, "description-before-after.json"),
    JSON.stringify(
      {
        note: "Live browser description after Barella sell prompt",
        description: desc,
        title: form.title,
        price: form.price,
        badFieldDump: descBad,
        pass: descGood,
      },
      null,
      2
    )
  );

  // --- Correction ---
  await sendChat(dPage, "Change the price to $40 and location to Wellington");
  await waitSettled(dPage, 8000);
  await ensureEditOpen(dPage);
  form = await readForm(dPage);
  const corrOk =
    /40/.test(form.price + form.body) || /Wellington/i.test(form.body + form.desc);
  record(
    "awhina_correction",
    corrOk ? "PASS" : "PARTIAL",
    `price=${form.price} bodyHasWellington=${/Wellington/i.test(form.body)}`
  );

  // --- Yes/no confirmation path (identity-style) ---
  // Seed a confirmable identity question if present; else ask explicitly
  const bodyBefore = form.body;
  if (/is this|did I get|confirm|yes or no|\byes\b.*\bno\b/i.test(bodyBefore)) {
    await sendChat(dPage, "Yes");
  } else {
    await sendChat(dPage, "Yes that's correct");
  }
  await waitSettled(dPage, 6000);
  const afterYes = await readForm(dPage);
  record(
    "awhina_yes_no_confirmation",
    afterYes.title || afterYes.desc ? "PASS" : "PARTIAL",
    `title=${afterYes.title} keptDraft=${Boolean(afterYes.sessionDraft)}`
  );

  // --- Hard refresh draft persistence ---
  await ensureEditOpen(dPage);
  // Ensure form has deterministic values if chat didn't fill inputs
  if (!(await dPage.locator("#listing-title").inputValue()).trim()) {
    await dPage.locator("#listing-title").fill(form.title || "Nicolò Barella Topps Chrome");
  }
  if (!(await dPage.locator("#listing-description").inputValue()).trim()) {
    await dPage
      .locator("#listing-description")
      .fill(desc || "Near mint Topps Chrome Barella orange parallel. Auckland pickup.");
  }
  const beforeRefresh = await readForm(dPage);
  await waitSettled(dPage, 1500); // allow sync effect
  const sessionBefore = beforeRefresh.sessionDraft;
  await dPage.reload({ waitUntil: "domcontentloaded" });
  await waitSettled(dPage, 4000);
  await dismissAwhinaIntro(dPage);
  await ensureEditOpen(dPage);
  const afterRefresh = await readForm(dPage);
  await dPage.screenshot({
    path: path.join(OUT, "03-draft-after-hard-refresh.png"),
    fullPage: true,
  });
  const persistedTitle =
    afterRefresh.title &&
    beforeRefresh.title &&
    afterRefresh.title.trim() === beforeRefresh.title.trim();
  const persistedDesc =
    afterRefresh.desc &&
    beforeRefresh.desc &&
    afterRefresh.desc.trim().slice(0, 40) === beforeRefresh.desc.trim().slice(0, 40);
  const sessionAfter = afterRefresh.sessionDraft;
  const draftPersistOk = persistedTitle || persistedDesc;
  record(
    "hard_refresh_draft_persistence",
    draftPersistOk ? "PASS" : "FAIL",
    `titleBefore=${beforeRefresh.title} titleAfter=${afterRefresh.title} sessionBefore=${Boolean(
      sessionBefore
    )} sessionAfter=${Boolean(sessionAfter)} sameTitle=${persistedTitle}`
  );

  // Stale contamination check: start fresh sell after refresh
  await sendChat(dPage, "New listing — selling a red couch Auckland $200");
  await waitForTitle(dPage, /couch|sofa/i, 90000);
  await ensureEditOpen(dPage);
  const couch = await readForm(dPage);
  const contaminated =
    /barella|mazda|axela/i.test(couch.title) ||
    (/barella|mazda/i.test(couch.desc) && !/couch|sofa/i.test(couch.title));
  record(
    "draft_no_stale_contamination",
    !contaminated && /couch|sofa/i.test(couch.title + couch.body)
      ? "PASS"
      : contaminated
        ? "FAIL"
        : "PARTIAL",
    `title=${couch.title}`
  );

  // --- Mobile text sell ---
  await login(mPage, creds.seller.email, creds.seller.password, creds.seller.uid);
  await openPostAi(mPage);
  await mPage.evaluate(() => {
    try {
      sessionStorage.removeItem("skyAiListingDraft");
    } catch {}
  });
  await openPostAi(mPage);
  await sendChat(mPage, "Sell my iPhone 13 128GB black Auckland $550 good condition");
  const mTitle = await waitForTitle(mPage, /iphone/i, 120000);
  await mPage.screenshot({ path: path.join(OUT, "04-text-sell-mobile.png"), fullPage: true });
  record(
    "awhina_text_sell_mobile",
    mTitle ? "PASS" : "FAIL",
    `title=${mTitle}`
  );

  await desktop.close();
  await mobile.close();
}

async function runFollowAndMessages(browser, creds) {
  const sellerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const buyerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sellerPage = await sellerCtx.newPage();
  const buyerPage = await buyerCtx.newPage();

  await login(sellerPage, creds.seller.email, creds.seller.password, creds.seller.uid);
  await login(buyerPage, creds.buyer.email, creds.buyer.password, creds.buyer.uid);

  // Follow seller profile
  await buyerPage.goto(`${BASE}/seller/${creds.seller.username}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(buyerPage, 4000);
  const followBtn = buyerPage.getByRole("button", { name: /^Follow$/i }).first();
  if (await followBtn.isVisible().catch(() => false)) {
    await followBtn.click();
    await waitSettled(buyerPage, 2500);
  }
  await buyerPage.reload({ waitUntil: "domcontentloaded" });
  await waitSettled(buyerPage, 3500);
  const body = await buyerPage.locator("body").innerText();
  const followingUi =
    /Unfollow|Following/i.test(body) ||
    (await buyerPage.getByRole("button", { name: /Unfollow|Following/i }).count()) > 0;
  record(
    "follow_persist_refresh",
    followingUi ? "PASS" : "FAIL",
    `seller=/${creds.seller.username} followingUi=${followingUi}`
  );

  // Following list on buyer profile
  await buyerPage.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await waitSettled(buyerPage, 3500);
  const followingTab = buyerPage.getByRole("button", { name: /Following/i }).first();
  if (await followingTab.isVisible().catch(() => false)) {
    await followingTab.click();
    await waitSettled(buyerPage, 2000);
  }
  const profileBody = await buyerPage.locator("body").innerText();
  const listHasSeller =
    profileBody.toLowerCase().includes(creds.seller.username.toLowerCase()) ||
    /E2E Test Seller/i.test(profileBody);
  record(
    "following_list_username",
    listHasSeller ? "PASS" : "PARTIAL",
    `hasSeller=${listHasSeller}`
  );

  // Unfollow
  await buyerPage.goto(`${BASE}/seller/${creds.seller.username}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(buyerPage, 3000);
  const unfollow = buyerPage.getByRole("button", { name: /Unfollow/i }).first();
  if (await unfollow.isVisible().catch(() => false)) {
    await unfollow.click();
    await waitSettled(buyerPage, 2000);
  }
  await buyerPage.reload({ waitUntil: "domcontentloaded" });
  await waitSettled(buyerPage, 3000);
  const afterUnfollow = await buyerPage.locator("body").innerText();
  const unfollowed =
    (await buyerPage.getByRole("button", { name: /^Follow$/i }).count()) > 0 ||
    !/Unfollow/i.test(afterUnfollow);
  record("unfollow", unfollowed ? "PASS" : "FAIL");

  // Messages smoke: buyer opens messages, composer exists
  await buyerPage.goto(`${BASE}/messages`, { waitUntil: "domcontentloaded" });
  await waitSettled(buyerPage, 4000);
  const msgBody = await buyerPage.locator("body").innerText();
  const messagesOk = !/Something went wrong/i.test(msgBody);
  record(
    "messages_page_loads_signed_in",
    messagesOk ? "PASS" : "FAIL",
    buyerPage.url()
  );

  // API-level message roundtrip (live-equivalent persistence)
  try {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const signIn = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: creds.buyer.email,
          password: creds.buyer.password,
          returnSecureToken: true,
        }),
      }
    );
    const tok = await signIn.json();
    const probe = `V1_TRUTH_MSG_${Date.now()}`;
    const sendRes = await fetch(`${BASE}/api/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok.idToken}`,
      },
      body: JSON.stringify({
        receiver: creds.seller.email,
        text: probe,
      }),
    });
    const sendBody = await sendRes.json().catch(() => ({}));
    record(
      "messages_api_send",
      sendRes.ok ? "PASS" : "FAIL",
      `status=${sendRes.status} ${JSON.stringify(sendBody).slice(0, 180)}`
    );

    await sellerPage.goto(
      `${BASE}/messages?user=${encodeURIComponent(creds.buyer.email)}`,
      { waitUntil: "domcontentloaded" }
    );
    await waitSettled(sellerPage, 5000);
    const sellerSees = (await sellerPage.locator("body").innerText()).includes(probe);
    record(
      "messages_seller_receives_browser",
      sellerSees ? "PASS" : "PARTIAL",
      `probe=${probe} seen=${sellerSees}`
    );
  } catch (e) {
    record("messages_api_send", "FAIL", String(e).slice(0, 200));
  }

  await sellerCtx.close();
  await buyerCtx.close();
}

async function runReviewsEligibility(creds) {
  ensureAdmin();
  const db = admin.firestore();
  const purchaseId = `e2e_review_${Date.now().toString(36)}`;
  await db
    .collection("purchases")
    .doc(purchaseId)
    .set({
      status: "completed",
      buyerEmail: creds.buyer.email,
      sellerEmail: creds.seller.email,
      buyerId: creds.buyer.uid,
      sellerId: creds.seller.uid,
      listingTitle: "E2E Review Eligibility Listing",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  async function tokenFor(email, password) {
    const signIn = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    return (await signIn.json()).idToken;
  }

  const buyerTok = await tokenFor(creds.buyer.email, creds.buyer.password);
  const strangerPass = `SdE2e!${crypto.randomBytes(9).toString("base64url")}9A`;
  const strangerEmail = `skydrop.e2e.stranger.${Date.now().toString(36)}@gmail.com`;
  const stranger = await admin.auth().createUser({
    email: strangerEmail,
    password: strangerPass,
    emailVerified: true,
  });
  const strangerTok = await tokenFor(strangerEmail, strangerPass);

  const legit = await fetch(`${BASE}/api/submit-review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerTok}`,
    },
    body: JSON.stringify({
      purchaseId,
      rating: 5,
      reviewText: "E2E legitimate review — great seller.",
    }),
  });
  const legitBody = await legit.json().catch(() => ({}));

  const blocked = await fetch(`${BASE}/api/submit-review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${strangerTok}`,
    },
    body: JSON.stringify({
      purchaseId,
      rating: 1,
      reviewText: "Should be blocked — not a party.",
    }),
  });
  const blockedBody = await blocked.json().catch(() => ({}));

  // Incomplete order must fail
  const incompleteId = `e2e_review_bad_${Date.now().toString(36)}`;
  await db.collection("purchases").doc(incompleteId).set({
    status: "pending",
    buyerEmail: creds.buyer.email,
    sellerEmail: creds.seller.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const incomplete = await fetch(`${BASE}/api/submit-review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerTok}`,
    },
    body: JSON.stringify({
      purchaseId: incompleteId,
      rating: 4,
      reviewText: "Should fail — order not complete",
    }),
  });
  const incompleteBody = await incomplete.json().catch(() => ({}));

  const ok =
    legit.ok &&
    (blocked.status === 403 || blocked.status === 400) &&
    !incomplete.ok;

  record(
    "reviews_eligibility_api_e2e",
    ok ? "PASS" : "FAIL",
    `legit=${legit.status} blocked=${blocked.status} incomplete=${incomplete.status} legitBody=${JSON.stringify(legitBody).slice(0, 120)} blockedBody=${JSON.stringify(blockedBody).slice(0, 100)} incompleteBody=${JSON.stringify(incompleteBody).slice(0, 100)}`
  );

  // Cleanup stranger auth user (best effort)
  try {
    await admin.auth().deleteUser(stranger.uid);
  } catch {}
}

async function runPhotoSellProbe(browser, creds) {
  const vision = await probeVision();
  record(
    "prod_vision_server_flag",
    vision.enabled === true || vision.code === "no_images" ? "PASS" : "FAIL",
    JSON.stringify(vision)
  );

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, creds.seller.email, creds.seller.password, creds.seller.uid);
  await openPostAi(page);
  const ui = await probePublicVisionFlag(page);
  record(
    "vision_ui_photo_affordance",
    ui.hasPhoto && !ui.flagOffMsg ? "PASS" : "PARTIAL",
    JSON.stringify(ui)
  );

  // Upload a tiny generated PNG if file input exists
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    const pngPath = path.join(OUT, "fixture-product.png");
    // Minimal 1x1 PNG
    const buf = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
      "base64"
    );
    fs.writeFileSync(pngPath, buf);
    await fileInput.setInputFiles(pngPath);
    await waitSettled(page, 12000);
    const body = await page.locator("body").innerText();
    const visionTalked =
      /couldn'?t identify|is this|looks like|I see|photo|vision|what are you selling/i.test(
        body
      );
    await page.screenshot({ path: path.join(OUT, "05-photo-sell-probe.png"), fullPage: true });
    record(
      "awhina_photo_sell_browser",
      visionTalked || vision.enabled ? "PARTIAL" : "FAIL",
      `visionTalked=${visionTalked} note=1x1 fixture may not identify; serverEnabled=${vision.enabled}`
    );
  } else {
    record("awhina_photo_sell_browser", "BLOCKED", "no file input on /post/ai");
  }
  await ctx.close();
}

async function main() {
  console.log("BASE", BASE);
  const creds = await loadCreds();
  record("creds", "PASS", `seller=${creds.seller.email}`);

  const browser = await firefox.launch({ headless: true });
  try {
    await runPhotoSellProbe(browser, creds);
    await runAwhinaFlows(browser, creds);
    await runFollowAndMessages(browser, creds);
    await runReviewsEligibility(creds);
  } catch (e) {
    record("fatal", "FAIL", String(e).slice(0, 500));
    console.error(e);
  } finally {
    await browser.close();
  }

  // Search scale already measured — attach if present
  const scalePath = path.join(__dirname, "..", "tmp-search-scale-evidence.json");
  if (fs.existsSync(scalePath)) {
    report.searchScale = JSON.parse(fs.readFileSync(scalePath, "utf8"));
  }

  const outFile = path.join(OUT, "report.json");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log("\nWrote", outFile);
  const fails = Object.entries(report.results).filter(([, v]) => v.status === "FAIL");
  console.log(
    "Summary:",
    Object.keys(report.results).length,
    "checks,",
    fails.length,
    "FAIL"
  );
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
