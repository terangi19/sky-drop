"use client";

// NSFW check is temporarily disabled due to webpack compilation issues
// Import will be uncommented when ENABLE_NSFW_CHECK=true
// import { checkImage } from "./nsfw";

// Stub function when NSFW is disabled
async function checkImage(file: File) {
  return { safe: true, predictions: [], reason: undefined };
}

export const SKY_AI_LISTING_IMAGES_EVENT = "sky-ai-listing-images";

export type SkyAiListingImagesDetail = {
  dataUrls: string[];
  names: string[];
};

export const SKY_AI_MAX_IMAGES_PER_MESSAGE = 4;

export async function compressImageFile(
  file: File,
  maxSide = 1280
): Promise<{ dataUrl: string; file: File }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not compress image"))),
      "image/jpeg",
      0.85
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  const compressed = new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(compressed);
  });

  return { dataUrl, file: compressed };
}

export async function prepareSkyAiImages(
  files: File[]
): Promise<{ dataUrls: string[]; names: string[]; files: File[] } | { error: string }> {
  const slice = files.slice(0, SKY_AI_MAX_IMAGES_PER_MESSAGE);
  const dataUrls: string[] = [];
  const names: string[] = [];
  const outFiles: File[] = [];

  for (const file of slice) {
    if (!file.type.startsWith("image/")) {
      return { error: `"${file.name}" is not an image.` };
    }
    const nsfw = await checkImage(file);
    if (!nsfw.safe) {
      return { error: `"${file.name}" flagged: ${nsfw.reason || "not allowed"}.` };
    }
    const { dataUrl, file: compressed } = await compressImageFile(file);
    if (dataUrl.length > 6_000_000) {
      return { error: `"${file.name}" is too large after compression.` };
    }
    dataUrls.push(dataUrl);
    names.push(compressed.name);
    outFiles.push(compressed);
  }

  return { dataUrls, names, files: outFiles };
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta?.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

export function dispatchListingImages(dataUrls: string[], names: string[]) {
  if (typeof window === "undefined" || !dataUrls.length) return;
  window.dispatchEvent(
    new CustomEvent<SkyAiListingImagesDetail>(SKY_AI_LISTING_IMAGES_EVENT, {
      detail: { dataUrls, names },
    })
  );
}
