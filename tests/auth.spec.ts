import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
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

  test("signup toggle switches to create account mode", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Create one/ }).click();
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible({ timeout: 10000 });
  });
});
