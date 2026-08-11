/**
 * Durable V1 surface checks — no multi-user auth required.
 * Full Awhina/messages/follow proofs live in scripts/e2e-v1-truth-gaps.cjs
 * (Firefox against prod with seeded E2E accounts).
 */
import { test, expect } from "@playwright/test";

test.describe("V1 truth gaps — unauthenticated surface", () => {
  test("canonical browse + digital load", async ({ page }) => {
    for (const path of ["/", "/vehicles", "/services", "/rentals", "/wanted", "/digital", "/search"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 500, `${path} status`).toBeLessThan(400);
    }
  });

  test("vision API reports enabled when flags on", async ({ request }) => {
    const res = await request.post("/api/awhina-vision", {
      data: { images: [] },
    });
    const body = await res.json();
    // Local .env.local has flags true → 400 no_images; disabled → 503
    if (body.enabled === false || res.status() === 503) {
      test.info().annotations.push({
        type: "note",
        description: "Vision disabled in this env — prod probe is source of truth for flags",
      });
      return;
    }
    expect(body.enabled).toBe(true);
    expect(body.code === "no_images" || res.status() === 400).toBeTruthy();
  });
});
