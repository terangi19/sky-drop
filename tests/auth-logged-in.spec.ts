import { test, expect } from "@playwright/test";

test.describe("Authenticated — Signed In", () => {

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    const testBtn = page.getByText("🧪 Test Login");
    await expect(testBtn).toBeVisible({ timeout: 15000 });
    await testBtn.click();
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("navbar shows user nav links after sign in", async ({ page }) => {
    await expect(page.getByText("Sell")).toBeVisible();
    await expect(page.getByText("Live Trade")).toBeVisible();
  });

  test("can access protected route /messages", async ({ page }) => {
    await page.goto("/messages");
    // Page renders without redirecting to login
    await expect(page.getByText("No conversations yet")).toBeVisible({ timeout: 10000 });
  });

  test("can access protected route /list-list", async ({ page }) => {
    await page.goto("/list-list");
    // Page has a heading with "My Listings" — use first() to avoid navbar match
    const heading = page.getByRole("heading").filter({ hasText: "My Listings" });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("can access profile page", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Profile").or(page.getByText("Edit Profile"))).toBeVisible({ timeout: 10000 });
  });

  test("dashboard loads with user data", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard").or(page.getByText("XP"))).toBeVisible({ timeout: 10000 });
  });

});
