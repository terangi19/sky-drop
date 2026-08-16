/**
 * Client preprocess for vision: one high-quality resize before upload, instant thumbnails.
 */

"use client";

import { prepareSkyAiImages } from "./sky-ai-images";

/** Vision max edge — preserve small text/serials/logos (was 1024, too aggressive). */
export const AWHINA_VISION_MAX_SIDE = 1536;

export async function prepareVisionListingImages(
  files: File[]
): Promise<{ dataUrls: string[]; names: string[]; files: File[] } | { error: string }> {
  const slice = files.slice(0, 4);
  // Reuse checks and perform ONE resize. Previously this first reduced files to
  // 1280px, then attempted 1536px, so packaging text could never recover detail.
  const prepared = await prepareSkyAiImages(slice, AWHINA_VISION_MAX_SIDE);
  if ("error" in prepared) return prepared;

  if (process.env.NODE_ENV === "development") {
    await Promise.all(
      prepared.files.map(async (file, index) => {
        const bitmap = await createImageBitmap(file);
        console.info("[awhina-vision:image]", {
          source: files[index]?.name || file.name,
          width: bitmap.width,
          height: bitmap.height,
          mimeType: file.type,
          encodedBytes: file.size,
          orientation: "browser-normalized",
        });
        bitmap.close();
      })
    );
  }

  return prepared;
}

/** Instant local object-URL thumbnails (do not block UI). */
export function createInstantThumbnails(files: File[]): string[] {
  return files.map((f) => URL.createObjectURL(f));
}

export function revokeThumbnails(urls: string[]): void {
  for (const u of urls) {
    if (u.startsWith("blob:")) URL.revokeObjectURL(u);
  }
}
