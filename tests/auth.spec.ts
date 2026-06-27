import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible({ timeout: 10000 });
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Join Sky Drop" })).toBeVisible({ timeout: 10000 });
  });

  test("homepage loads without auth", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated trade-feed shows public content", async ({ page }) => {
    await page.goto("/trade-feed");
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
  });

  test("FAQ page is public", async ({ page }) => {
    await page.goto("/faqs");
    await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible({ timeout: 10000 });
  });

  test("Terms page is public", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("Privacy page is public", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("protected routes render without crashing when unauthenticated", async ({ page }) => {
    const routes = ["/messages", "/list-list", "/profile", "/watchlist"];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
    }
  });

  test("login links to signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /Join free/i })).toBeVisible({ timeout: 10000 });
  });
});
