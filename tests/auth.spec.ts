import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 10000 });
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

  test("login validates and exposes accessible credentials controls", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Sign in" });

    // Empty fields: cannot submit
    await expect(submit).toBeDisabled();
    await expect(page).toHaveURL(/\/login/);

    // Invalid email: HTML validity is false
    await email.fill("not-an-email");
    await password.fill("incorrect-password");
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    await expect(submit).toBeEnabled();

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("login preserves safe navigation links and rejects external redirects", async ({ page }) => {
    await page.goto("/login?redirect=https%3A%2F%2Fevil.example");
    const main = page.getByRole("main");
    // External redirect must not leak into signup (sanitizeRedirectPath rejects it)
    await expect(main.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
    await expect(main.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    await expect(main.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    await expect(main.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

    // Safe internal redirect still passes through to signup
    await page.goto("/login?redirect=%2Fmessages");
    await expect(page.getByRole("main").getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?redirect=%2Fmessages"
    );
  });
});
