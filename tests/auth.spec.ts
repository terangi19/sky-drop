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

  test("signup preserves only safe redirects", async ({ page }) => {
    await page.goto("/signup?redirect=%2Fprofile");
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?redirect=%2Fprofile");

    for (const redirect of ["/%252f%252fevil.example", "/%255c%255cevil.example", "javascript%3Aalert(1)"]) {
      await page.goto(`/signup?redirect=${redirect}`);
      await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    }
  });

  test("auth shells remain usable at mobile widths", async ({ page }) => {
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ["/login", "/signup", "/forgot-password"]) {
        await page.goto(path);
        const main = page.getByRole("main");
        await expect(main).toBeVisible();
        // Navbar search can be first in DOM but intentionally hidden on mobile.
        await expect(main.locator("input:visible").first()).toBeVisible();
        expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  });
});
