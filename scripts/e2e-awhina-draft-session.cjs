/* eslint-disable no-console */
/**
 * Local Firefox regression: an old hydrated draft must not survive Start new
 * and an in-flight vision result must only persist into its own listing task.
 * Run with `node scripts/e2e-awhina-draft-session.cjs` while `npm run dev` runs.
 */
const { firefox } = require("playwright");

const oldDraft = {
  draftId: "bike-draft",
  title: "Marin mountain bike",
  description: "Old bike draft that must never return.",
  category: "Sports",
  listingType: "physical",
};
const cardsTitle = "Yu-Gi-Oh! Egyptian God Cards – Ra, Slifer & Obelisk";

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/api/awhina-vision", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        displayIdentity: cardsTitle,
        needsIdentityConfirm: false,
        missingPrompts: ["price", "location"],
        listingFill: {
          title: cardsTitle,
          description: "Yu-Gi-Oh! Egyptian God Cards: Ra, Slifer and Obelisk.",
          category: "Sports",
          listingType: "physical",
          extras: ["subject:Ra, Slifer & Obelisk", "set:Egyptian God Cards"],
          replaceDraft: true,
        },
      }),
    });
  });

  await page.goto("http://localhost:3000/post/ai", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.evaluate((draft) => {
    sessionStorage.setItem("skyAiListingDraft", JSON.stringify(draft));
  }, oldDraft);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(300);
  const hydrated = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "{}")
  );
  if (hydrated.title !== oldDraft.title) throw new Error("Fixture draft was not available to hydration");

  await page.getByRole("button", { name: "Start new listing", exact: true }).click();
  await page.getByText("Marin mountain bike").count().then((count) => {
    if (count) throw new Error("Start new left the old title in the editor");
  });

  const upload = page.locator('input[type="file"]').first();
  await upload.setInputFiles({
    name: "egyptian-god-cards.png",
    mimeType: "image/png",
    // Valid 1×1 PNG; the mocked vision route supplies the deterministic result.
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0XQAAAABJRU5ErkJggg==",
      "base64"
    ),
  });
  await page.getByText(cardsTitle).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);

  const beforeRefresh = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "{}")
  );
  if (beforeRefresh.title !== cardsTitle || JSON.stringify(beforeRefresh).includes("Marin mountain bike")) {
    throw new Error(`Wrong persisted draft before refresh: ${JSON.stringify(beforeRefresh)}`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByText(cardsTitle).first().waitFor({ timeout: 15_000 });
  const afterRefresh = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "{}")
  );
  if (afterRefresh.title !== cardsTitle || JSON.stringify(afterRefresh).includes("Marin mountain bike")) {
    throw new Error(`Wrong persisted draft after refresh: ${JSON.stringify(afterRefresh)}`);
  }
  console.log(JSON.stringify({ pass: true, title: afterRefresh.title, draftId: afterRefresh.draftId }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
