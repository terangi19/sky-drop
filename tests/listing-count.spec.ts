import { test, expect } from "@playwright/test";

/**
 * Homepage used to render "0 listings" from the empty initial array while
 * Firestore was still in flight. Hold the listings fetch so we can assert
 * the loading placeholder instead of a fake zero.
 */
test.describe("BUG · Marketplace listing count does not flash 0 while loading", () => {
  test("homepage count stays in loading state instead of 0 listings", async ({ page }) => {
    await page.route(/firestore\.googleapis\.com/, async () => {
      await new Promise(() => {});
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-listing-count="loading"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/^0 listings$/)).toHaveCount(0);
    await expect(page.locator('[data-listing-count="0"]')).toHaveCount(0);
  });

  test("vehicles (Cars) count stays in loading state instead of 0", async ({ page }) => {
    await page.route(/firestore\.googleapis\.com/, async () => {
      await new Promise(() => {});
    });

    await page.goto("/vehicles", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Vehicles/i }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[data-listing-count="loading"]').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/^0 vehicles$/)).toHaveCount(0);
    await expect(page.getByText(/0 vehicles found/i)).toHaveCount(0);
    await expect(page.locator('[data-listing-count="0"]')).toHaveCount(0);
  });
});
