import { test, expect } from "@playwright/test";

const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass123!";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
  });

  test("homepage loads without auth", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
  });

  test("redirects unauthenticated users from trade feed to login", async ({ page }) => {
    await page.goto("/trade-feed");
    await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
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

  test("redirects unauthenticated users from protected routes", async ({ page }) => {
    const protectedRoutes = ["/messages", "/list-list", "/profile", "/watchlist", "/trade-feed"];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: /Login|Create Account/ })).toBeVisible({ timeout: 10000 });
    }
  });

  test("signup toggle switches to create account mode", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Create one/ }).click();
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible({ timeout: 10000 });
  });
});
