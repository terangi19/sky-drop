import { test, expect } from "@playwright/test";

test.describe("UI & Core Flows", () => {
  test("page renders in dark mode", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const hasDark = await page.locator("html").evaluate(el => el.classList.contains("dark"));
    expect(hasDark).toBe(true);
  });

  test("redirects unauthenticated users from trade feed", async ({ page }) => {
    await page.goto("/trade-feed");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
  });

  test("login page has email and password inputs", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder("Password")).toBeVisible({ timeout: 10000 });
  });

  test("back button works on detail pages", async ({ page }) => {
    await page.goto("/about");
    await page.waitForTimeout(2000);
    const backLink = page.getByRole("link", { name: "Back" });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/");
  });

  test("checkbox and input elements render", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(2000);
    const inputs = page.locator("input");
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const title = await page.title();
    expect(title).toContain("Sky Drop");
  });

  test("redirects unauthenticated users from listing detail page", async ({ page }) => {
    await page.goto("/post/listing/invalid-id");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
  });
});
