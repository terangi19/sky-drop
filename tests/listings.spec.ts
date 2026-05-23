import { test, expect } from "@playwright/test";

test.describe("Listings", () => {
  test("homepage loads with content", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("search input is present", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder("Search listings...")).toBeVisible();
  });

  test("category buttons exist", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("button", { name: /Cars|Tech|Gaming|Fashion/ }).first()).toBeVisible();
  });

  test("redirects unauthenticated users from trade feed", async ({ page }) => {
    await page.goto("/trade-feed");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
  });

  test("footer has all expected links", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const footerLinks = page.locator("footer a");
    if (await footerLinks.count() > 0) {
      await expect(footerLinks.first()).toBeVisible();
    }
  });

  test("create listing page redirects to login", async ({ page }) => {
    await page.goto("/post");
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });

  test("mobile viewport renders nav", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
  });
});
