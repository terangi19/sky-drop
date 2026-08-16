/**
 * Client preprocess for vision: one high-quality resize before upload, instant thumbnails.
 *
 * UI thumbnails stay as blob: object URLs from the ORIGINAL File.
 * Vision encoding is a SEPARATE pass at AWHINA_VISION_MAX_SIDE — never feed
 * an already-crushed 1280px chat preview into the multimodal identifier.
 */

"use client";

import { prepareSkyAiImages } from "./sky-ai-images";

/** Vision max edge — preserve small text/serials/logos (was 1024, too aggressive). */
export const AWHINA_VISION_MAX_SIDE = 1536;
/** Prefer readable packaging text over aggressive JPEG crushing. */
export const AWHINA_VISION_JPEG_QUALITY = 0.92;

export async function prepareVisionListingImages(
  files: File[]
): Promise<{ dataUrls: string[]; names: string[]; files: File[] } | { error: string }> {
  const slice = files.slice(0, 4);
  // ONE resize from the original capture/upload — never a second pass on a
  // 1280px preview. Higher JPEG quality keeps product labels readable.
  const prepared = await prepareSkyAiImages(
    slice,
    AWHINA_VISION_MAX_SIDE,
    AWHINA_VISION_JPEG_QUALITY
  );
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
          maxSide: AWHINA_VISION_MAX_SIDE,
          jpegQuality: AWHINA_VISION_JPEG_QUALITY,
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
