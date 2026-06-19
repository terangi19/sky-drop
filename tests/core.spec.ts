import { test, expect } from "@playwright/test";

test.describe("Tier 2 — Core Flows", () => {

  test("create listing page pre-selects type from query param", async ({ page }) => {
    const types = [
      { param: "digital", label: "Digital" },
      { param: "service", label: "Service" },
      { param: "rental", label: "Rental" },
      { param: "vehicle", label: "Vehicle" },
      { param: "wanted", label: "Wanted" },
    ];
    for (const t of types) {
      await page.goto(`/post/ai?type=${t.param}`);
      const selected = page.locator("button").filter({ has: page.getByText(t.label, { exact: true }) });
      await expect(selected.first()).toBeVisible();
    }
  });

  test("create listing defaults to Physical when no type param", async ({ page }) => {
    await page.goto("/post/ai");
    await expect(page.getByText("Physical").first()).toBeVisible();
  });

  test("create listing shows event fields when Event is selected", async ({ page }) => {
    await page.goto("/post/ai?type=event");
    await expect(page.getByText(/Event date/i)).toBeVisible();
  });

  test("create listing shows vehicle fields when Vehicle is selected", async ({ page }) => {
    await page.goto("/post/ai?type=vehicle");
    await expect(page.getByText("Vehicle Details")).toBeVisible();
    await expect(page.getByText("Make *")).toBeVisible();
  });

  test("create listing shows job fields when Job is selected", async ({ page }) => {
    await page.goto("/post/ai?type=job");
    await expect(page.getByText("Company *")).toBeVisible();
  });

  test("create listing shows property fields when Property is selected", async ({ page }) => {
    await page.goto("/post/ai?type=property");
    await expect(page.getByText("Property Details")).toBeVisible();
  });

  test("create listing shows rental fields when Rental is selected", async ({ page }) => {
    await page.goto("/post/ai?type=rental");
    await expect(page.getByText("Rental Type")).toBeVisible();
    await expect(page.getByText(/Daily Rate/i)).toBeVisible();
  });

  test("create listing shows service fields when Service is selected", async ({ page }) => {
    await page.goto("/post/ai?type=service");
    await expect(page.getByText("Pricing Type")).toBeVisible();
  });

  test("create listing shows digital fields when Digital is selected", async ({ page }) => {
    await page.goto("/post/ai?type=digital");
    await expect(page.getByText("Digital File")).toBeVisible();
  });

  test("category page buttons link with correct type param", async ({ page }) => {
    const checks = [
      { url: "/services", linkText: "Offer a Service", expected: "/post/ai?type=service" },
      { url: "/rentals", linkText: "List a Rental", expected: "/post/ai?type=rental" },
      { url: "/vehicles", linkText: "List a Vehicle", expected: "/post/ai?type=vehicle" },
      { url: "/jobs", linkText: "Post a Job", expected: "/post/ai?type=job" },
    ];
    for (const c of checks) {
      await page.goto(c.url);
      const link = page.locator(`a[href="${c.expected}"]`).first();
      await expect(link).toBeVisible();
    }
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
  });

  test("privacy page loads", async ({ page }) => {
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
  });

  test("terms page loads", async ({ page }) => {
    const response = await page.goto("/terms");
    expect(response?.status()).toBe(200);
  });

});
