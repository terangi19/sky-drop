import { test, expect, type Page } from "@playwright/test";

async function loggedOutReturnPath(page: Page): Promise<string> {
  try {
    try {
      const url = new URL(page.url());
      if (url.pathname === "/login") {
        return decodeURIComponent(url.searchParams.get("redirect") || "");
      }
    } catch {
      /* ignore invalid URL while navigating */
    }
    const signIn = page.getByRole("link", { name: "Sign in" }).first();
    if ((await signIn.count()) === 0) return "";
    const attr = await signIn.getAttribute("href");
    if (!attr) return "";
    return decodeURIComponent(new URL(attr, "http://localhost:3000").searchParams.get("redirect") || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Target crashed") || message.includes("has been closed")) return "";
    throw error;
  }
}

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 10000 });
  });

  test("signup page loads", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Join Sky Drop" })).toBeVisible({ timeout: 10000 });
  });

  test("signup blocks invalid email and short password before Join free", async ({ page }) => {
    await page.goto("/signup");
    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Join free" });

    await expect(email).toBeVisible({ timeout: 10000 });
    await expect(submit).toBeDisabled();

    const terms = page.getByRole("main").getByRole("checkbox");
    await expect(terms).toBeVisible();
    await terms.setChecked(true, { force: true });
    await expect(submit).toBeDisabled();

    await email.fill("not-an-email");
    await password.fill("short");
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText(/Password must be at least 8 characters/)).toBeVisible();
    await expect(submit).toBeDisabled();

    await email.fill("you@example.com");
    await password.fill("password1");
    await expect(page.getByText("Enter a valid email address.")).toHaveCount(0);
    await expect(page.getByText(/Password must be at least 8 characters/)).toHaveCount(0);
    await expect(submit).toBeEnabled();
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

  test("unauthenticated /messages redirects to login with return URL", async ({ page }) => {
    await page.goto("/messages");
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 15000 });
    const redirect = new URL(page.url()).searchParams.get("redirect") || "";
    expect(decodeURIComponent(redirect)).toBe("/messages");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 10000 });
  });

  test("unauthenticated /messages deep link preserves conversation return URL", async ({ page }) => {
    await page.goto("/messages?conversation=abc123");
    await expect(page).toHaveURL(/\/login\?redirect=/, { timeout: 15000 });
    const redirect = new URL(page.url()).searchParams.get("redirect") || "";
    expect(decodeURIComponent(redirect)).toBe("/messages?conversation=abc123");
  });

  const gatedPrivateRoutes = [
    "/list-list",
    "/purchases",
    "/sales",
    "/watchlist",
    "/notifications",
    "/disputes",
    "/reports",
    "/dashboard/applications",
    "/wanted/create",
    "/post/ai",
    "/profile/settings",
  ] as const;

  for (const route of gatedPrivateRoutes) {
    test(`unauthenticated ${route} redirects to login with return URL`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect.poll(() => loggedOutReturnPath(page), { timeout: 20000 }).toBe(route);
    });
  }

  test("unauthenticated /post follows the /post/ai redirect then gates with that return URL", async ({ page }) => {
    await page.goto("/post", { waitUntil: "domcontentloaded" });
    await expect.poll(() => loggedOutReturnPath(page), { timeout: 20000 }).toBe("/post/ai");
  });

  test("unauthenticated /post/edit deep link redirects to login with return URL", async ({ page }) => {
    await page.goto("/post/edit/listing123", { waitUntil: "domcontentloaded" });
    await expect.poll(() => loggedOutReturnPath(page), { timeout: 20000 }).toBe("/post/edit/listing123");
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
    await expect(page.getByRole("main").getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?redirect=%2Fmessages"
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
    test.setTimeout(120_000);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ["/login", "/signup", "/forgot-password"]) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20000 });
            break;
          } catch (error) {
            if (attempt === 2) throw error;
            await page.waitForTimeout(500);
          }
        }
        const main = page.getByRole("main");
        await expect(main).toBeVisible({ timeout: 20000 });
        // Navbar search can be first in DOM but intentionally hidden on mobile.
        await expect(main.locator("input:visible").first()).toBeVisible({ timeout: 20000 });
        expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  });

  test("forgot-password keeps a safe return path", async ({ page }) => {
    await page.goto("/forgot-password?redirect=%2Fpost%2Fai", { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("link", { name: /back to login/i }).first()).toHaveAttribute(
      "href",
      "/login?redirect=%2Fpost%2Fai",
      { timeout: 15000 }
    );
  });
});
