/**
 * In-memory cache for active-draft vision analysis.
 * One batch fingerprint → one recognition. No rerun on unrelated React state.
 */

import type { VisionAdapterResult } from "./awhina-vision-adapter";
import type { VisionListingObservation } from "./awhina-vision-observation";

export type VisionCacheEntry = {
  observation: VisionListingObservation;
  adapted: VisionAdapterResult;
  imageFingerprint: string;
  draftKey: string;
  createdAt: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  model?: string;
};

const CACHE_TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 64;
const store = new Map<string, VisionCacheEntry>();

/** Stable fingerprint from data-URL prefixes + lengths (avoid hashing full megabytes). */
export function fingerprintVisionImages(images: string[]): string {
  return images
    .map((img) => {
      const head = img.slice(0, 64);
      const mid = img.slice(Math.floor(img.length / 2), Math.floor(img.length / 2) + 32);
      const tail = img.slice(-48);
      return `${img.length}:${simpleHash(head + mid + tail)}`;
    })
    .join("|");
}

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function visionCacheKey(draftKey: string, imageFingerprint: string): string {
  return `${draftKey || "anon"}::${imageFingerprint}`;
}

function prune(): void {
  if (store.size <= MAX_ENTRIES) return;
  const entries = [...store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  const drop = entries.length - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) store.delete(entries[i][0]);
}

export function getVisionCache(key: string): VisionCacheEntry | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit;
}

export function setVisionCache(key: string, entry: Omit<VisionCacheEntry, "createdAt">): void {
  store.set(key, { ...entry, createdAt: Date.now() });
  prune();
}

export function clearVisionCacheForTests(): void {
  store.clear();
}
