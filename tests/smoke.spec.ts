import { test, expect } from "@playwright/test";

async function expectOk(page: import("@playwright/test").Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await expect(page.locator("body")).toBeAttached();
}

test.describe("Tier 1 — Smoke Tests", () => {
  test("homepage loads all key sections", async ({ page }) => {
    await expectOk(page, "/");
    await expect(page.getByRole("link", { name: "Sky Drop home" }).nth(1)).toBeVisible();
    await expect(page.locator(".hero-search-input").first()).toBeVisible();
    await expect(page.getByText("Welcome to Sky Drop").first()).toBeVisible();
    await expect(page.getByText(/Latest listings/i).first()).toBeVisible();
  });

  test("search filters listings on input", async ({ page }) => {
    await expectOk(page, "/");
    const searchInput = page.locator(".hero-search-input").first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test");
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
  });

  test("navbar navigation links visible when logged out", async ({ page }) => {
    await expectOk(page, "/");
    await expect(page.getByText("Login").first()).toBeVisible();
  });

  test("category page — digital store loads", async ({ page }) => {
    await expectOk(page, "/digital");
    await expect(page.getByRole("heading", { name: /Digital/i }).first()).toBeVisible();
  });

  test("category page — services loads", async ({ page }) => {
    await expectOk(page, "/services");
    await expect(page.getByRole("heading", { name: /Services/i }).first()).toBeVisible();
  });

  test("category page — rentals loads", async ({ page }) => {
    await expectOk(page, "/rentals");
    await expect(page.getByRole("heading", { name: /Rentals/i }).first()).toBeVisible();
  });

  test("category page — vehicles loads", async ({ page }) => {
    await expectOk(page, "/vehicles");
    await expect(page.getByRole("heading", { name: /Vehicles/i }).first()).toBeVisible();
  });

  test("category page — property loads (legacy browse)", async ({ page }) => {
    await expectOk(page, "/property");
    await expect(page.getByRole("heading", { name: /Property/i }).first()).toBeVisible();
  });

  test("category page — events loads (legacy browse)", async ({ page }) => {
    await expectOk(page, "/events");
    await expect(page.getByRole("heading", { name: /Events/i }).first()).toBeVisible();
  });

  test("category page — jobs loads (legacy browse)", async ({ page }) => {
    await expectOk(page, "/jobs");
    await expect(page.getByRole("heading", { name: /Jobs/i }).first()).toBeVisible();
  });

  test("nav renders on canonical category pages", async ({ page }) => {
    for (const route of ["/", "/digital", "/services", "/rentals", "/vehicles", "/wanted"]) {
      await expectOk(page, route);
      await expect(page.getByRole("link", { name: "Sky Drop home" }).nth(1)).toBeVisible();
    }
  });

  test("mobile — homepage renders without errors", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expectOk(page, "/");
    await expect(page.locator(".hero-search-input").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Open menu|Close menu/i })).toBeVisible();
  });

  test("mobile — category pages render without errors", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/digital", "/services", "/rentals", "/vehicles", "/wanted"]) {
      await expectOk(page, route);
      await expect(page.locator("body")).toBeAttached();
    }
  });
});
