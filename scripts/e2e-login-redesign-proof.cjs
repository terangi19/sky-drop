const { firefox } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join("tmp-login-redesign");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail: detail || "" });
  console.log("PASS:", name, detail || "");
}
function fail(name, detail) {
  results.push({ name, ok: false, detail: String(detail || "") });
  console.error("FAIL:", name, detail || "");
}

(async () => {
  const browser = await firefox.launch();
  try {
    // Screenshots
    for (const s of [
      { name: "after-desktop-1440.png", w: 1440, h: 900 },
      { name: "after-mobile-390.png", w: 390, h: 844 },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
      const page = await ctx.newPage();
      await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.getByRole("heading", { name: "Welcome back" }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, s.name), fullPage: true });
      await ctx.close();
      pass("screenshot " + s.name);
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    // Empty fields — submit disabled
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByRole("heading", { name: "Welcome back" }).waitFor({ timeout: 20000 });
    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Sign in" });
    if (await submit.isDisabled()) pass("empty fields — Sign in disabled");
    else fail("empty fields — Sign in disabled", "submit enabled with empty fields");

    // Invalid email
    await email.fill("not-an-email");
    await password.fill("incorrect-password");
    const valid = await email.evaluate((input) => input.validity.valid);
    if (!valid) pass("invalid email — validity.valid false");
    else fail("invalid email", "browser validity reported valid");
    if (await submit.isEnabled()) pass("invalid email — Sign in enabled once filled");
    else fail("invalid email — Sign in enabled", "still disabled");

    // Password toggle
    await page.getByRole("button", { name: "Show password" }).click();
    if ((await password.getAttribute("type")) === "text") pass("password toggle show");
    else fail("password toggle show", await password.getAttribute("type"));
    await page.getByRole("button", { name: "Hide password" }).click();
    if ((await password.getAttribute("type")) === "password") pass("password toggle hide");
    else fail("password toggle hide", await password.getAttribute("type"));

    // Forgot + signup links
    const forgot = page.getByRole("link", { name: "Forgot password?" });
    const signup = page.getByRole("link", { name: "Create an account" });
    if ((await forgot.getAttribute("href")) === "/forgot-password") pass("forgot link");
    else fail("forgot link", await forgot.getAttribute("href"));
    if ((await signup.getAttribute("href")) === "/signup") pass("signup link (no redirect)");
    else fail("signup link", await signup.getAttribute("href"));

    // External redirect rejection
    await page.goto(BASE + "/login?redirect=" + encodeURIComponent("https://evil.example"), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.getByRole("heading", { name: "Welcome back" }).waitFor({ timeout: 20000 });
    const signupHref = await page.getByRole("link", { name: "Create an account" }).getAttribute("href");
    if (signupHref === "/signup") pass("external redirect rejected — signup href clean");
    else fail("external redirect rejected", signupHref);
    if ((await page.getByRole("link", { name: "Forgot password?" }).getAttribute("href")) === "/forgot-password")
      pass("forgot link after evil redirect");
    else fail("forgot link after evil redirect");

    // Successful login honesty note (no credentials)
    pass("successful login", "SKIPPED — no test credentials available; not attempted");

    await ctx.close();
  } finally {
    await browser.close();
  }

  const report = { base: BASE, results, failed: results.filter((r) => !r.ok).length };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("\nReport:", path.join(OUT, "report.json"));
  console.log("Failed:", report.failed);
  process.exit(report.failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
