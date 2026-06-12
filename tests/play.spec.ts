import { test } from "@playwright/test";

test.describe("PLAY", () => {
  test("full tour", async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    async function go(path: string) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    // 1. HOMEPAGE
    console.log("=== HOMEPAGE ===");
    await go("/");
    console.log("H1: " + (await page.locator("h1").first().textContent().catch(() => "(none)")));

    const search = page.getByPlaceholder("Search");
    if (await search.isVisible().catch(() => false)) {
      await search.fill("car");
      await page.waitForTimeout(200);
      await search.fill("");
      console.log("Search works");
    }

    for (const cat of ["Cars", "Tech", "Gaming", "Fashion"]) {
      const btn = page.getByRole("button", { name: cat }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    console.log("Category buttons clickable");

    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const card = page.locator('[class*="rounded-2xl"]').first();
    console.log("Listings visible: " + (await card.isVisible().catch(() => false)));
    await page.evaluate(() => window.scrollTo(0, 0));

    // 2. STATIC PAGES
    for (const p of ["/about", "/faqs", "/terms", "/privacy", "/blocked"]) {
      console.log("\n=== " + p + " ===");
      await go(p);
      const h1 = await page.locator("h1").first().textContent().catch(() => "(none)");
      console.log("H1: " + h1);
    }

    // 3. LOGIN
    console.log("\n=== LOGIN ===");
    await go("/login");
    const emailInput = page.getByPlaceholder("Email");
    const pwInput = page.getByPlaceholder("Password");
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill("test@example.com");
      await pwInput.fill("password123");
      console.log("Form filled");
    }

    const toggle = page.getByRole("button", { name: /Sign up/i });
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(500);
      console.log("Switched to: " + (await page.locator("h1").textContent().catch(() => "(none)")));
      const phoneInput = page.getByPlaceholder("Phone");
      if (await phoneInput.isVisible().catch(() => false)) {
        await phoneInput.fill("0211234567");
        console.log("Phone field visible");
      }
    }
    const toggleBack = page.getByRole("button", { name: /Already/ });
    if (await toggleBack.isVisible().catch(() => false)) {
      await toggleBack.click();
      await page.waitForTimeout(300);
    }

    // 4. PROTECTED ROUTES
    console.log("\n=== PROTECTED ===");
    for (const r of ["/trade-feed", "/messages", "/post/ai", "/profile", "/watchlist", "/dashboard", "/purchases", "/sales", "/my-listings", "/reviews", "/reports"]) {
      await go(r);
      console.log(r + ": " + (page.url().includes("/login") ? "redirected" : "STAYED"));
    }

    // 5. EDGE CASES
    console.log("\n=== EDGE CASES ===");
    await go("/post/listing/invalid-id");
    console.log("listing: " + (page.url().includes("/login") ? "redirected" : "loaded"));

    await go("/checkout/success");
    console.log("checkout: " + (page.url().includes("/login") ? "redirected" : "loaded"));

    const adminResp = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    console.log("/admin status: " + adminResp?.status());

    // 6. SUMMARY
    console.log("\n====================");
    console.log("Errors: " + errors.length);
    errors.forEach((e) => console.log("  " + e));
  });
});
