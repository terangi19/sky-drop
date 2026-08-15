const { firefox } = require("playwright");

const photo = {
  name: "blue-chair.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  ),
};

async function submitPhoto(page, source) {
  if (source === "Take Photo") {
    await page.getByRole("button", { name: "Take Photo", exact: true }).click();
    await page.getByRole("button", { name: "Shutter" }).click();
    await page.getByRole("button", { name: "Use photo" }).click();
    return;
  }

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose Photos" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(photo);
}

async function assertPhotoFlow(page, source) {
  await submitPhoto(page, source);

  await page.waitForFunction(() => {
    const chat = document.querySelector(".awhina-listing-workspace-chat");
    return (
      chat &&
      getComputedStyle(chat).display !== "none" &&
      chat.querySelectorAll("img").length > 0 &&
      document.body.innerText.includes("📷 Photo")
    );
  });

  const analysingVisible = await page
    .getByText("Āwhina is looking at your photo…")
    .isVisible();
  if (!analysingVisible) {
    throw new Error(`${source}: user photo did not transition into analysing state`);
  }

  try {
    await page.waitForFunction(
      () => {
        const listing = document.querySelectorAll('img[alt^="Listing photo"]');
        const realPhotoMessage =
          document.querySelectorAll(".awhina-listing-workspace-chat img").length > 0 &&
          document.body.innerText.includes("📷 Photo");
        const draft = JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "null");
        return realPhotoMessage && listing.length > 0 && draft?.title === "Blue chair";
      },
      null,
      { timeout: 15_000 }
    );
  } catch (error) {
    console.error(await page.evaluate(() => ({
      body: document.body.innerText.slice(0, 1000),
      draft: sessionStorage.getItem("skyAiListingDraft"),
      listingImages: document.querySelectorAll('img[alt^="Listing photo"]').length,
    })));
    throw error;
  }

  const proof = await page.evaluate(() => ({
    conversationImages: document.querySelectorAll(".awhina-listing-workspace-chat img").length,
    listingImages: document.querySelectorAll('img[alt^="Listing photo"]').length,
    draftTitle: JSON.parse(sessionStorage.getItem("skyAiListingDraft") || "null")?.title,
    chatVisible: getComputedStyle(document.querySelector(".awhina-listing-workspace-chat")).display !== "none",
  }));
  if (!proof.conversationImages || !proof.listingImages || !proof.draftTitle || !proof.chatVisible) {
    throw new Error(`${source}: photo was not present in both real chat and listing state`);
  }
  return proof;
}

(async () => {
  const browser = await firefox.launch({ headless: true });
  const results = {};

  for (const source of ["Choose Photos", "Take Photo"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (source === "Take Photo") {
      await context.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (...args) {
          const context = originalGetContext.apply(this, args);
          if (context && args[0] === "2d") {
            context.drawImage = () => {};
          }
          return context;
        };
        Object.defineProperties(HTMLVideoElement.prototype, {
          videoWidth: { configurable: true, get: () => 2 },
          videoHeight: { configurable: true, get: () => 2 },
        });
        HTMLMediaElement.prototype.play = async () => {};
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          configurable: true,
          value: async () => new MediaStream(),
        });
        Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
          configurable: true,
          value: async () => [{ kind: "videoinput", deviceId: "fixture-camera" }],
        });
      });
    }

    const page = await context.newPage();
    await page.route("**/api/awhina-vision", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          displayIdentity: "Blue chair",
          needsIdentityConfirm: false,
          missingPrompts: ["price", "location", "delivery"],
          reply: "I found a blue chair. What price, location, and delivery options should I use?",
          listingFill: {
            title: "Blue chair",
            description: "Blue chair in good condition.",
            category: "Home",
            listingType: "physical",
          },
        }),
      });
    });
    await page.goto("http://localhost:3000/post/ai", { waitUntil: "domcontentloaded" });
    results[source] = await assertPhotoFlow(page, source);
    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
