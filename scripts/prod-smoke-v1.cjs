/**
 * Production smoke for messaging-first V1 (guest + public surfaces).
 * Run: node scripts/prod-smoke-v1.cjs
 */
const { firefox } = require("playwright");
const fs = require("fs");

const BASE = "https://skydrop.co.nz";
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const mark = status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : "SKIP";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitSettled(page, ms = 2500) {
  await page.waitForTimeout(ms);
}

async function guestDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitSettled(page, 5000);
    const body = await page.locator("body").innerText();
    const listingCount = await page.locator("text=/\\d+ listings?/i").first().textContent().catch(() => "");
    const falseZero = /0 listings/i.test(body) && !/\d+ listings/i.test(body.replace(/0 listings/i, ""));
    const hasCards = /\$\d+|Auckland|Message/i.test(body) && !/Something went wrong/i.test(body);
    if (/Something went wrong/i.test(body)) record("HOME listings loaded", "FAIL", "error state");
    else if (hasCards || /\d+ listings/i.test(listingCount || "") && !/^0 listings/i.test((listingCount || "").trim()))
      record("HOME listings loaded", "PASS", listingCount || "cards visible");
    else if (falseZero) record("HOME listings loaded", "FAIL", "false 0 listings");
    else record("HOME listings loaded", "FAIL", body.slice(0, 120).replace(/\s+/g, " "));

    await page.goto(`${BASE}/search?q=iphone`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitSettled(page, 4500);
    const searchBody = await page.locator("body").innerText();
    if (/Something went wrong/i.test(searchBody)) record("SEARCH iphone", "FAIL", "error state");
    else record("SEARCH iphone", "PASS", searchBody.slice(0, 90).replace(/\s+/g, " "));

    const listingUrl = `${BASE}/post/listing/qZw7nVe6LFoaqBOsbWJh`;
    await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitSettled(page, 4500);
    const listingText = await page.locator("body").innerText();
    const hasMessage = /Message Seller/i.test(listingText);
    record("LISTING open + Message Seller", hasMessage ? "PASS" : "FAIL", listingUrl);

    // Guest Message Seller → login with redirect
    const msgBtn = page.getByRole("button", { name: /Message Seller/i }).first();
    if (await msgBtn.count()) {
      await msgBtn.click();
      await waitSettled(page, 3000);
      const afterUrl = page.url();
      const afterText = await page.locator("body").innerText();
      const gated =
        /\/login/i.test(afterUrl) ||
        /Log in|Welcome back|Need an account|Sign up/i.test(afterText);
      const hasRedirect = /redirect=/i.test(afterUrl);
      record(
        "GUEST Message Seller auth gate",
        gated ? "PASS" : "FAIL",
        `url=${afterUrl} redirect=${hasRedirect}`
      );
      if (gated && hasRedirect) {
        record("GUEST return-after-auth redirect param", "PASS", afterUrl.slice(0, 120));
      } else if (gated) {
        record("GUEST return-after-auth redirect param", "FAIL", "login without redirect=");
      }
    } else {
      record("GUEST Message Seller auth gate", "FAIL", "no Message Seller button");
    }

    await page.goto(listingUrl, { waitUntil: "domcontentloaded" });
    await waitSettled(page, 3500);
    const reportBtn = page.getByRole("button", { name: /Report listing/i }).first();
    const reportVisible = (await reportBtn.count()) > 0 || (await page.getByText(/Report listing/i).count()) > 0;
    record("GUEST Report visible", reportVisible ? "PASS" : "FAIL");
    if (reportVisible && (await reportBtn.count())) {
      await reportBtn.click();
      await waitSettled(page, 2000);
      const u = page.url();
      const t = await page.locator("body").innerText();
      const gated =
        /\/login/i.test(u) ||
        /Log in|Welcome back|intent=report|Sign in/i.test(t) ||
        /reason|Submit report|What's wrong/i.test(t);
      record("GUEST Report login-gated", gated ? "PASS" : "FAIL", u);
    } else {
      record("GUEST Report login-gated", "NOT TESTED");
    }

    // Seller public
    const sellerLink = page.locator('a[href*="/seller/"]').first();
    if (await sellerLink.count()) {
      await sellerLink.click();
      await waitSettled(page, 4000);
      const sBody = await page.locator("body").innerText();
      const bad = /Something went wrong/i.test(sBody);
      record("SELLER public page", bad ? "FAIL" : "PASS", page.url());
    } else {
      record("SELLER public page", "NOT TESTED", "no seller link on listing");
    }
  } catch (e) {
    record("GUEST desktop journey", "FAIL", e.message);
  } finally {
    await page.close();
  }
}

async function mobileWidths(browser) {
  for (const w of [320, 375, 390, 430]) {
    const page = await browser.newPage({ viewport: { width: w, height: 844 } });
    try {
      await page.goto(`${BASE}/post/listing/qZw7nVe6LFoaqBOsbWJh`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await waitSettled(page, 4000);
      const text = await page.locator("body").innerText();
      const msgOk = /Message Seller/i.test(text);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      const collision = await page.evaluate(() => {
        const msg = Array.from(document.querySelectorAll("a,button")).find((el) =>
          /message seller/i.test(el.textContent || "")
        );
        if (!msg) return { found: false, overlaps: false };
        const r = msg.getBoundingClientRect();
        const fixed = Array.from(document.querySelectorAll("*")).filter((el) => {
          const s = getComputedStyle(el);
          return (
            (s.position === "fixed" || s.position === "sticky") &&
            parseFloat(s.bottom || "auto") >= 0 &&
            s.bottom !== "auto"
          );
        });
        const overlaps = fixed.some((el) => {
          const fr = el.getBoundingClientRect();
          if (fr.height < 8 || fr.width < 8) return false;
          return fr.top < r.bottom && fr.bottom > r.top && fr.left < r.right && fr.right > r.left;
        });
        return { found: true, overlaps };
      });
      const fail = overflow > 2 || !msgOk || (collision.found && collision.overlaps);
      record(
        `MOBILE ${w}px listing`,
        fail ? "FAIL" : "PASS",
        `overflow=${overflow} msg=${msgOk} collide=${!!collision.overlaps}`
      );

      // Search at this width
      await page.goto(`${BASE}/search?q=bike`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitSettled(page, 3500);
      const sov = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      record(`MOBILE ${w}px search`, sov > 2 ? "FAIL" : "PASS", `overflow=${sov}`);
    } catch (e) {
      record(`MOBILE ${w}px`, "FAIL", e.message);
    } finally {
      await page.close();
    }
  }
}

async function seoChecks(browser) {
  const page = await browser.newPage();
  try {
    const sm = await page.goto(`${BASE}/sitemap.xml`, { waitUntil: "domcontentloaded", timeout: 60000 });
    record("SEO sitemap.xml", sm && sm.ok() ? "PASS" : "FAIL", String(sm && sm.status()));
    const xml = await page.content();
    record("SEO drafts not in sitemap", /isDraft|status.?draft/i.test(xml) ? "FAIL" : "PASS");

    await page.goto(`${BASE}/post/listing/qZw7nVe6LFoaqBOsbWJh`, { waitUntil: "domcontentloaded" });
    const title = await page.title();
    const canon = await page.locator('link[rel="canonical"]').getAttribute("href").catch(() => null);
    const og = await page.locator('meta[property="og:title"]').getAttribute("content").catch(() => null);
    const tw = await page.locator('meta[name="twitter:card"]').getAttribute("content").catch(() => null);
    const desc = await page.locator('meta[name="description"]').getAttribute("content").catch(() => null);
    const ok = Boolean(title && canon && og && tw && desc);
    record("SEO listing meta", ok ? "PASS" : "FAIL", `title=${!!title} canon=${!!canon} og=${!!og} tw=${!!tw}`);
  } catch (e) {
    record("SEO checks", "FAIL", e.message);
  } finally {
    await page.close();
  }
}

async function apiAuthStatuses() {
  try {
    const res = await fetch(`${BASE}/api/unread-counts`);
    record(
      "API unread-counts unauth status",
      res.status === 401 ? "PASS" : "FAIL",
      `status=${res.status}`
    );
  } catch (e) {
    record("API unread-counts unauth status", "FAIL", e.message);
  }
}

(async () => {
  await apiAuthStatuses();
  const browser = await firefox.launch({ headless: true });
  try {
    await guestDesktop(browser);
    await mobileWidths(browser);
    await seoChecks(browser);
  } finally {
    await browser.close();
  }
  console.log("\n=== SUMMARY ===");
  const fail = results.filter((r) => r.status === "FAIL");
  const pass = results.filter((r) => r.status === "PASS");
  const skip = results.filter((r) => r.status === "NOT TESTED");
  console.log(`PASS=${pass.length} FAIL=${fail.length} NOT_TESTED=${skip.length}`);
  fs.writeFileSync("prod-smoke-results.json", JSON.stringify(results, null, 2));
  if (fail.length) {
    console.log("Failures:");
    fail.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exitCode = 1;
  }
})();
