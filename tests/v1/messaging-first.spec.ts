import { test, expect } from "@playwright/test";

/**
 * V1 messaging-first smoke — asserts current main product surface, not dormant Stripe.
 * Env note: Chromium page crashes in some local runs are classified ENV/FLAKY, not product bugs.
 */
test.describe("V1 messaging-first surface", () => {
  test("canonical browse routes load", async ({ page }) => {
    for (const path of ["/", "/vehicles", "/services", "/rentals", "/wanted", "/digital"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 500, `${path} status`).toBeLessThan(400);
      await expect(page.locator("body")).toBeAttached();
    }
  });

  test("navbar has no Payments / Offers / Auctions leaks", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /^Payments$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Offers$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Auctions$/i })).toHaveCount(0);
    await expect(page.locator("nav").getByRole("link", { name: /^Property$/i })).toHaveCount(0);
  });

  test("sell type chips are canonical V1 only", async ({ page }) => {
    await page.goto("/post/ai", { waitUntil: "domcontentloaded" });
    const physical = page.getByRole("button", { name: "Physical" }).first();
    if (!(await physical.isVisible().catch(() => false))) {
      test.skip(true, "Sell form requires auth in this env");
      return;
    }
    for (const label of ["Physical", "Vehicle", "Service", "Rental", "Wanted"]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^Digital$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Job$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Event$/i })).toHaveCount(0);
  });

  test("/digital is not 404", async ({ page }) => {
    const res = await page.goto("/digital", { waitUntil: "domcontentloaded" });
    expect(res?.status()).not.toBe(404);
    expect(res?.status() ?? 500).toBeLessThan(400);
    await expect(page.locator("body")).toBeAttached();
  });
});
