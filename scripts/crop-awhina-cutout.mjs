import sharp from "sharp";
import { mkdir } from "fs/promises";

/**
 * Brand sheet — FULL BODY panel, top-right.
 * Front-facing figure (leftmost in the turnaround row).
 * Upper body only: head to waist/hips. No title, panels, or UI chrome.
 */
const SRC =
  "C:/Users/rangi/AppData/Roaming/Cursor/User/workspaceStorage/empty-window/images/99c5c241-e182-4536-a93b-65b8cee8a718-ceb1378d-d568-41ab-b305-8c611747ed52.png";

const OUT_W = 420;

// Verified: front-facing full-body figure, upper body (head → waist)
const CROP = { left: 544, top: 28, width: 98, height: 172 };
const OUT_H = Math.round(CROP.height * (OUT_W / CROP.width));

async function removeDarkBackground(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = new Uint8ClampedArray(data);

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    const isVeryDark = lum < 36;
    const isDarkNavy = lum < 72 && b > r + 4 && b >= g - 4;
    const isBrightBlueUi = b > 120 && b > r + 30 && b > g + 10;
    const isSkin = r > 90 && g > 60 && r > b + 8;

    let alpha = 255;

    if (isBrightBlueUi || (isVeryDark && !isSkin)) {
      alpha = 0;
    } else if (isDarkNavy && !isSkin) {
      const t = Math.min(1, Math.max(0, (lum - 18) / 40));
      alpha = Math.round(t * 255);
    } else if (lum < 48 && !isSkin && b > r) {
      alpha = Math.round(((lum - 14) / 34) * 255);
    }

    pixels[i + 3] = alpha;
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();
}

async function processPipeline(crop) {
  const extracted = await sharp(SRC)
    .extract(crop)
    .resize(OUT_W, OUT_H, { fit: "fill", kernel: "lanczos3" })
    .sharpen({ sigma: 0.6, m1: 1.0, m2: 0.35, x1: 2, y2: 10, y3: 20 })
    .png()
    .toBuffer();

  return removeDarkBackground(extracted);
}

await mkdir("public/awhina", { recursive: true });

const cutout = await processPipeline(CROP);

await sharp(cutout).png({ compressionLevel: 9 }).toFile("public/awhina/awhina-cutout.png");
await sharp(cutout).webp({ quality: 95 }).toFile("public/awhina/awhina-cutout.webp");

const meta = await sharp("public/awhina/awhina-cutout.png").metadata();
console.log(`Exported awhina-cutout: ${meta.width}x${meta.height}`);
console.log(`Crop: left=${CROP.left} top=${CROP.top} width=${CROP.width} height=${CROP.height}`);
