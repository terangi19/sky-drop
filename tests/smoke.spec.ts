import { test, expect } from "@playwright/test";

test.describe("Tier 1 — Smoke Tests", () => {

  test("homepage loads all key sections", async ({ page }) => {
    await page.goto("/");

    // Logo / brand visible
    await expect(page.getByText(/SKY/i).first()).toBeVisible();
    await expect(page.getByText(/DROP/i).first()).toBeVisible();

    // Search bar
    await expect(page.getByPlaceholder("Search listings...")).toBeVisible();

    // Browse Categories section
    await expect(page.getByText("Browse Categories")).toBeVisible();

    // Trending section
    await expect(page.getByText("Hot This Week")).toBeVisible();

    // Listing cards or empty state render
    await expect(page.locator("main")).toBeVisible();
  });

  test("search filters listings on input", async ({ page }) => {
    await page.goto("/");
    const searchInput = page.getByPlaceholder("Search listings...");
    await expect(searchInput).toBeVisible();

    await searchInput.fill("test");
    // The clear/search buttons are in the right side of the search bar
    const searchContainer = page.locator("div").filter({ has: page.getByPlaceholder("Search listings...") });
    const clearBtn = searchContainer.getByRole("button").first();
    await expect(clearBtn).toBeVisible();
  });

  test("navbar navigation links visible when logged out", async ({ page }) => {
    await page.goto("/");

    // Login link exists for unauthenticated users
    await expect(page.getByText("Login").first()).toBeVisible();
  });

  test("category page — digital store loads", async ({ page }) => {
    const response = await page.goto("/digital");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Digital", { exact: false }).first()).toBeVisible();
  });

  test("category page — services loads", async ({ page }) => {
    const response = await page.goto("/services");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Services", { exact: false }).first()).toBeVisible();
  });

  test("category page — rentals loads", async ({ page }) => {
    const response = await page.goto("/rentals");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Rentals", { exact: false }).first()).toBeVisible();
  });

  test("category page — vehicles loads", async ({ page }) => {
    const response = await page.goto("/vehicles");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Vehicles", { exact: false }).first()).toBeVisible();
  });

  test("category page — property loads", async ({ page }) => {
    const response = await page.goto("/property");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Property", { exact: false }).first()).toBeVisible();
  });

  test("category page — events loads", async ({ page }) => {
    const response = await page.goto("/events");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Events", { exact: false }).first()).toBeVisible();
  });

  test("category page — jobs loads", async ({ page }) => {
    const response = await page.goto("/jobs");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Jobs", { exact: false }).first()).toBeVisible();
  });

  test("nav renders on all category pages", async ({ page }) => {
    const pages = ["/", "/digital", "/services", "/rentals", "/vehicles", "/property", "/events", "/jobs"];
    for (const route of pages) {
      await page.goto(route);
      await expect(page.getByText(/SKY/i).first()).toBeVisible();
      await expect(page.getByText(/DROP/i).first()).toBeVisible();
    }
  });

  test("mobile — homepage renders without errors", async ({ page }) => {
    // iPhone 12 viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByPlaceholder("Search listings...")).toBeVisible();
    // Nav hamburger should be visible on mobile
    await expect(page.locator('[aria-label="Toggle menu"]')).toBeVisible();
  });

  test("mobile — category pages render without errors", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pages = ["/digital", "/services", "/rentals", "/vehicles", "/property", "/events", "/jobs"];
    for (const route of pages) {
      await page.goto(route);
      await expect(page.getByText("How It Works")).toBeVisible();
    }
  });

});
