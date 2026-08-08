/**
 * Client preprocess for vision: resize before upload, instant thumbnails.
 * Does not modify protected sky-ai-images — wraps its compressor at a smaller side.
 */

"use client";

import { compressImageFile, prepareSkyAiImages } from "./sky-ai-images";

/** Vision max edge — keep under ~1MP for cost/latency (not 12–48MP originals). */
export const AWHINA_VISION_MAX_SIDE = 1024;

export async function prepareVisionListingImages(
  files: File[]
): Promise<{ dataUrls: string[]; names: string[]; files: File[] } | { error: string }> {
  const slice = files.slice(0, 4);
  // Reuse NSFW + type checks from prepareSkyAiImages, then re-compress smaller for vision API
  const prepared = await prepareSkyAiImages(slice);
  if ("error" in prepared) return prepared;

  const dataUrls: string[] = [];
  const names: string[] = [];
  const outFiles: File[] = [];

  for (let i = 0; i < prepared.files.length; i++) {
    const { dataUrl, file } = await compressImageFile(
      prepared.files[i],
      AWHINA_VISION_MAX_SIDE
    );
    if (dataUrl.length > 4_500_000) {
      return { error: `"${prepared.names[i]}" is too large after resize.` };
    }
    dataUrls.push(dataUrl);
    names.push(file.name);
    outFiles.push(file);
  }

  return { dataUrls, names, files: outFiles };
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
