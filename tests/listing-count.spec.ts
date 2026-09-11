import { test, expect } from "@playwright/test";

/**
 * Homepage used to paint "0 listings" from the empty initial array, then
 * jump to the real count. Same class of flash on /vehicles (Cars).
 * Record data-listing-count as it changes and assert 0 is never followed
 * by a later positive count.
 */
async function trackListingCount(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as Window & { __listingCountLog?: string[] };
    w.__listingCountLog = [];
    const record = () => {
      const el = document.querySelector("[data-listing-count]");
      const v = el?.getAttribute("data-listing-count");
      const log = w.__listingCountLog!;
      if (v != null && log[log.length - 1] !== v) log.push(v);
    };
    const tick = () => {
      record();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new MutationObserver(record).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-listing-count"],
    });
  });
}

function flashedFakeZero(log: string[]): boolean {
  const idx0 = log.indexOf("0");
  if (idx0 === -1) return false;
  return log.slice(idx0 + 1).some((v) => /^\d+$/.test(v) && Number(v) > 0);
}

test.describe("BUG · Marketplace listing count does not flash 0 while loading", () => {
  test("homepage count never flashes 0 then the real number", async ({ page }) => {
    await trackListingCount(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Latest listings/i).first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => {
        const log = await page.evaluate(
          () => (window as Window & { __listingCountLog?: string[] }).__listingCountLog || []
        );
        return log.some((v) => v === "loading" || /^\d+$/.test(v));
      }, { timeout: 30000 })
      .toBe(true);

    const log = await page.evaluate(
      () => (window as Window & { __listingCountLog?: string[] }).__listingCountLog || []
    );
    expect(flashedFakeZero(log), `count sequence: ${log.join(" → ")}`).toBe(false);
  });

  test("vehicles (Cars) count never flashes 0 then the real number", async ({ page }) => {
    await trackListingCount(page);
    await page.goto("/vehicles", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Vehicles/i }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect
      .poll(async () => {
        const log = await page.evaluate(
          () => (window as Window & { __listingCountLog?: string[] }).__listingCountLog || []
        );
        return log.some((v) => v === "loading" || /^\d+$/.test(v));
      }, { timeout: 30000 })
      .toBe(true);

    const log = await page.evaluate(
      () => (window as Window & { __listingCountLog?: string[] }).__listingCountLog || []
    );
    expect(flashedFakeZero(log), `count sequence: ${log.join(" → ")}`).toBe(false);
  });
});
